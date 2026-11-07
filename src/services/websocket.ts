import { ConnectionStatus, NodeXEvent } from '../types';
import { apiClient } from './rest';
import { recordLiveEvent } from './engineLogs';
type EventListener=(event:NodeXEvent)=>void;
type StatusListener=(status:ConnectionStatus,latencyMs:number)=>void;

export function normalizeBackendEvent(raw:any, receivedAt?:string):NodeXEvent {
  const isSolanaLog=raw?.method==='logsNotification';
  const rawType=typeof raw?.type==='string'?raw.type:(isSolanaLog?'solana_logs_notification':'unknown_event');
  const value=raw?.params?.result?.value||{};
  const timestamp=String(
    raw?.data?.received_at||raw?.data?.detected_at||raw?.data?.timestamp||raw?.timestamp||receivedAt||new Date().toISOString()
  );
  const data:Record<string,any>=isSolanaLog?{
    component:'solana_logs',
    program_id:raw?.nodex_program_id||null,
    signature:value.signature||null,
    slot:raw?.params?.result?.context?.slot??null,
    transaction_error:value.err??null,
    log_messages:Array.isArray(value.logs)?value.logs:[],
    raw_notification:raw,
    received_at:timestamp,
  }:(raw?.data&&typeof raw.data==='object'?raw.data:raw);
  const mint=data.mint_address||data.token_mint||data.base_mint;
  const signature=data.signature||null;
  const eventId=typeof raw?.event_id==='string' && raw.event_id.length > 0
    ? raw.event_id
    : isSolanaLog
      ? [rawType,data.program_id||raw?.nodex_program_id||'',signature||'',data.slot??''].join(':')
      : [rawType,signature||data.pool_address||mint||'',data.event_index??'',timestamp].join(':');
  let message=data.message;
  if(!message){
    switch(rawType){
      case 'solana_logs_notification': message=`Raw Solana logs received from ${data.program_id||'program'} (${data.log_messages.length} log lines).`; break;
      case 'launch_detected': message=`New Pump.fun launch detected: ${data.mint_address||'mint unavailable'}`; break;
      case 'pumpswap_activity': message=`PumpSwap ${data.event_type||'activity'}: ${data.pool_address||'pool unresolved'}`; break;
      case 'pumpswap_volume_update': message=`PumpSwap volume updated for pool ${data.pool_address||'unknown'}`; break;
      case 'token_scan_started': message=`Security scan started: ${data.mint_address||'unknown mint'}`; break;
      case 'token_scan_update': message=`Security scan updated: ${data.mint_address||'unknown mint'}`; break;
      case 'diagnostic': message='Backend diagnostic'; break;
      case 'connection_status': message='Connected to NodeX backend event stream'; break;
      case 'engine_state': message=`Engine ${data.paused?'paused':'running'} in ${data.mode||'paper'} mode`; break;
      default: message=rawType.replace(/_/g,' ');
    }
  }
  return {
    event_id:eventId,
    event_type:rawType as NodeXEvent['event_type'],
    timestamp,
    token_mint:mint,
    message:String(message),
    processing_status:rawType==='diagnostic'?'failed':'processed',
    tx_signature:signature||undefined,
    data,
  };
}

export class NodeXWebSocketService {
  private ws:WebSocket|null=null; private status:ConnectionStatus='disconnected';
  private latencyMs=0; private listeners=new Set<EventListener>();
  private statusListeners=new Set<StatusListener>();
  private reconnectTimer:ReturnType<typeof setTimeout>|null=null;
  private heartbeatWatchdog:ReturnType<typeof setInterval>|null=null;
  private lastMessageAt=0; private connecting=false;
  private reconnectAttempts=0; private manuallyClosed=false; private seen=new Set<string>();
  private tokenSubscriptions=new Map<string,string>();
  constructor(){this.connect();}
  public connect():void {
    this.manuallyClosed=false;
    if(this.ws&&(this.ws.readyState===WebSocket.OPEN||this.ws.readyState===WebSocket.CONNECTING))return;
    if(this.connecting)return;
    const settings=apiClient.getSettings();
    if(!settings.wsUrl){this.setStatus('disconnected',0);return;}
    if(!settings.adminApiKey.trim()){
      this.setStatus('disconnected',0);
      this.emitLocalEvent('diagnostic','warning','frontend_websocket','Operator API key is not saved on this device. Enter it in Settings to receive live data.',{url:settings.wsUrl});
      return;
    }
    this.setStatus(this.reconnectAttempts?'reconnecting':'disconnected',0);
    this.connecting=true;
    void apiClient.issueWebSocketTicket().then((ticket)=>{
      this.connecting=false;
      if(this.manuallyClosed)return;
      const separator=settings.wsUrl.includes('?')?'&':'?';
      const socket=new WebSocket(settings.wsUrl+separator+'ticket='+encodeURIComponent(ticket));
      this.ws=socket;
      socket.onopen=()=>{
        this.reconnectAttempts=0;this.lastMessageAt=Date.now();
        if(this.heartbeatWatchdog)clearInterval(this.heartbeatWatchdog);
        this.heartbeatWatchdog=setInterval(()=>{
          if(this.ws===socket&&socket.readyState===WebSocket.OPEN&&Date.now()-this.lastMessageAt>45000)socket.close(4000,'NodeX server heartbeat timeout');
        },10000);
        this.setStatus('connected',0);
        this.emitLocalEvent('websocket_connected','info','frontend_websocket','Authenticated browser WebSocket connected to the NodeX backend.',{url:settings.wsUrl});
        // Restore page-level subscriptions after every successful reconnect.
        for (const [mint,timeframe] of this.tokenSubscriptions) {
          this.send({command:'subscribe_token',mint});
          this.send({command:'set_chart_timeframe',mint,timeframe});
        }
      };
      socket.onmessage=(message)=>{
        try {
          const raw=JSON.parse(String(message.data));
          if(!raw||typeof raw!=='object'||typeof raw.type!=='string')return;
          this.lastMessageAt=Date.now();if(raw.type==='heartbeat')return;
          recordLiveEvent(raw.type, raw);
// The backend already filters its browser stream to approved application events.
          // Forward every typed event so pages do not silently lose new backend event types.
          const event=normalizeBackendEvent(raw);if(this.seen.has(event.event_id))return;
          this.seen.add(event.event_id);if(this.seen.size>3000)this.seen.delete(this.seen.values().next().value as string);
          this.dispatch(event);
        }catch(error){
          console.warn('Unable to parse NodeX WebSocket message',error);
          this.emitLocalEvent('diagnostic','warning','frontend_websocket','Received a WebSocket message that could not be parsed as NodeX JSON.',{error:error instanceof Error?error.message:String(error)});
        }
      };
      socket.onerror=()=>{
        this.setStatus('reconnecting',0);
        this.emitLocalEvent('diagnostic','error','frontend_websocket','WebSocket transport error. Check the backend URL, TLS/WSS proxy, and network access.',{url:settings.wsUrl});
      };
      socket.onclose=(event)=>{
        if(this.heartbeatWatchdog){clearInterval(this.heartbeatWatchdog);this.heartbeatWatchdog=null;}
        if(this.ws===socket)this.ws=null;this.setStatus('disconnected',0);
        if(!this.manuallyClosed)this.emitLocalEvent('diagnostic','warning','frontend_websocket','Authenticated WebSocket closed; a fresh single-use ticket will be requested on reconnect.',{url:settings.wsUrl,close_code:event.code,close_reason:event.reason||null,reconnect_attempt:this.reconnectAttempts+1});
        this.scheduleReconnect();
      };
    }).catch((error)=>{
      this.connecting=false;this.setStatus('disconnected',0);
      this.emitLocalEvent('diagnostic','error','frontend_websocket',error instanceof Error?error.message:'Could not obtain an authenticated WebSocket ticket.',{url:settings.wsUrl});
      // Do not hammer the server when the key is missing or rejected.
      if(!/API key|401|403|operator/i.test(error instanceof Error?error.message:''))this.scheduleReconnect();
    });
  }
  private emitLocalEvent(type:NodeXEvent['event_type'],severity:string,component:string,message:string,data:Record<string,any>={}):void {
    const timestamp=new Date().toISOString();
    this.dispatch({
      event_id:`client-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      event_type:type,
      timestamp,
      message,
      processing_status:severity==='error'?'failed':'processed',
      data:{...data,severity,component,received_at:timestamp,source:'frontend'}
    });
  }
  private scheduleReconnect():void {
    if(this.manuallyClosed||this.reconnectTimer)return;
    const delay=Math.min(30000,1000*(2**Math.min(this.reconnectAttempts,5)));
    this.reconnectAttempts++;this.setStatus('reconnecting',0);
    this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.connect();},delay);
  }
  public disconnect():void {
    this.manuallyClosed=true;this.connecting=false;if(this.reconnectTimer)clearTimeout(this.reconnectTimer);
    if(this.heartbeatWatchdog)clearInterval(this.heartbeatWatchdog);
    this.heartbeatWatchdog=null;this.reconnectTimer=null;this.ws?.close();this.ws=null;this.setStatus('disconnected',0);
  }
  public async testConnection(): Promise<void> {
    const settings=apiClient.getSettings();
    if(!settings.wsUrl) throw new Error('WebSocket URL is missing. Save the backend connection in Settings.');
    const ticket=await apiClient.issueWebSocketTicket();
    const separator=settings.wsUrl.includes('?')?'&':'?';
    const socketUrl=settings.wsUrl+separator+'ticket='+encodeURIComponent(ticket);
    await new Promise<void>((resolve,reject)=>{
      let settled=false;
      const socket=new WebSocket(socketUrl);
      const timeout=window.setTimeout(()=>finish(new Error('WebSocket handshake timed out after 10 seconds.')),10000);
      const finish=(error?:Error)=>{
        if(settled)return;
        settled=true;
        window.clearTimeout(timeout);
        try{socket.close(1000,'Connection test complete');}catch{/* already closed */}
        if(error)reject(error);else resolve();
      };
      socket.onopen=()=>finish();
      socket.onerror=()=>finish(new Error('Authenticated WebSocket handshake failed. Check TLS/WSS and reverse-proxy upgrade settings.'));
      socket.onclose=(event)=>{if(!settled)finish(new Error(`WebSocket closed before connecting (code ${event.code}).`));};
    });
  }
  public subscribeToken(mint:string,timeframe='5m'):void {
    const normalized=mint.trim();
    if(!normalized)return;
    this.tokenSubscriptions.set(normalized,timeframe);
    if(this.ws?.readyState===WebSocket.OPEN){
      this.send({command:'subscribe_token',mint:normalized});
      this.send({command:'set_chart_timeframe',mint:normalized,timeframe});
    }
  }
  public setChartTimeframe(mint:string,timeframe:'1m'|'5m'|'15m'|'1h'|'24h'):void {
    const normalized=mint.trim();
    if(!normalized)return;
    this.tokenSubscriptions.set(normalized,timeframe);
    if(this.ws?.readyState===WebSocket.OPEN)this.send({command:'set_chart_timeframe',mint:normalized,timeframe});
  }
  public unsubscribeToken(mint:string):void {
    const normalized=mint.trim();
    if(!normalized)return;
    this.tokenSubscriptions.delete(normalized);
    if(this.ws?.readyState===WebSocket.OPEN)this.send({command:'unsubscribe_token',mint:normalized});
  }
  public sendCommand(command:'pause'|'resume'|'start'|'status'|'set_mode',mode?:'paper'):boolean {
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;
    this.ws.send(JSON.stringify(mode?{command,mode}:{command}));return true;
  }
  public send(payload:{command:string;mode?:string;mint?:string;timeframe?:string}):void {
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN)throw new Error('NodeX WebSocket is not connected.');
    this.ws.send(JSON.stringify(payload));
  }
  public setPaused(_paused:boolean):void{/* Backend owns pause state. */}
  public getPaused():boolean{return false;}
  public getStatus(){return {status:this.status,latencyMs:this.latencyMs};}
  private setStatus(status:ConnectionStatus,latencyMs:number):void {
    this.status=status;this.latencyMs=latencyMs;this.statusListeners.forEach(fn=>fn(status,latencyMs));
  }
  public subscribe(fn:EventListener):()=>void{this.listeners.add(fn);return()=>this.listeners.delete(fn);}
  public onStatusChange(fn:StatusListener):()=>void{this.statusListeners.add(fn);fn(this.status,this.latencyMs);return()=>this.statusListeners.delete(fn);}
  public dispatch(event:NodeXEvent):void{this.listeners.forEach(fn=>{try{fn(event);}catch(error){console.error('NodeX event listener failed',error);}});}
}
export const wsService=new NodeXWebSocketService();
