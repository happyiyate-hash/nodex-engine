import { ConnectionStatus, NodeXEvent } from '../types';
import { apiClient } from './api';
type EventListener=(event:NodeXEvent)=>void;
type StatusListener=(status:ConnectionStatus,latencyMs:number)=>void;

export class NodeXWebSocketService {
  private ws:WebSocket|null=null; private status:ConnectionStatus='disconnected';
  private latencyMs=0; private listeners=new Set<EventListener>();
  private statusListeners=new Set<StatusListener>();
  private reconnectTimer:ReturnType<typeof setTimeout>|null=null;
  private reconnectAttempts=0; private manuallyClosed=false; private seen=new Set<string>();
  constructor(){this.connect();}
  public connect():void {
    this.manuallyClosed=false;
    if(this.ws&&(this.ws.readyState===WebSocket.OPEN||this.ws.readyState===WebSocket.CONNECTING))return;
    const url=apiClient.getSettings().wsUrl;
    if(!url){this.setStatus('disconnected',0);return;}
    this.setStatus(this.reconnectAttempts?'reconnecting':'disconnected',0);
    try {
      const socket=new WebSocket(url); this.ws=socket;
      socket.onopen=()=>{
        this.reconnectAttempts=0;
        this.setStatus('connected',0);
        this.emitLocalEvent('websocket_connected','info','frontend_websocket','Browser WebSocket connected to the NodeX backend.',{url});
      };
      socket.onmessage=(message)=>{
        try {
          const raw=JSON.parse(String(message.data));
          if(!raw||typeof raw!=='object'||typeof raw.type!=='string')return;
          const data=raw.data&&typeof raw.data==='object'?raw.data:raw;
          const timestamp=data.received_at||data.detected_at||new Date().toISOString();
          const mint=data.mint_address||data.token_mint||data.base_mint;
          const id=[raw.type,data.signature||data.pool_address||mint||'',data.event_index??'',timestamp].join(':');
          if(this.seen.has(id))return;
          this.seen.add(id);
          if(this.seen.size>3000)this.seen.delete(this.seen.values().next().value as string);
          const event:NodeXEvent={event_id:id,event_type:raw.type as NodeXEvent['event_type'],
            timestamp,token_mint:mint,message:data.message||this.describe(raw.type,data),
            processing_status:raw.type==='diagnostic'?'failed':'processed',
            tx_signature:data.signature,data};
          // Browser-to-backend WebSocket health is independent from the backend's
          // upstream Solana RPC stream health. TerminalContext tracks both separately.
          this.dispatch(event);
        } catch(error){
          console.warn('Unable to parse NodeX WebSocket message',error);
          this.emitLocalEvent('diagnostic','warning','frontend_websocket','Received a WebSocket message that could not be parsed as NodeX JSON.',{
            error:error instanceof Error?error.message:String(error)
          });
        }
      };
      socket.onerror=()=>{
        this.setStatus('reconnecting',0);
        this.emitLocalEvent('diagnostic','error','frontend_websocket','The browser reported a WebSocket transport error. Check the backend URL, TLS/WSS proxy, network access, and backend logs.',{url});
      };
      socket.onclose=(event)=>{
        if(this.ws===socket)this.ws=null;
        this.setStatus('disconnected',0);
        if(!this.manuallyClosed){
          this.emitLocalEvent('diagnostic','warning','frontend_websocket','WebSocket connection closed; automatic reconnection will be attempted.',{
            url,close_code:event.code,close_reason:event.reason||null,was_clean:event.wasClean,
            reconnect_attempt:this.reconnectAttempts+1
          });
        }
        this.scheduleReconnect();
      };
    } catch(error) {
      this.setStatus('disconnected',0);
      this.emitLocalEvent('diagnostic','error','frontend_websocket',error instanceof Error?error.message:'Could not create the backend WebSocket connection.',{url});
      this.scheduleReconnect();
    }
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
  private describe(type:string,data:any):string {
    switch(type){
      case 'launch_detected':return `New Pump.fun launch detected: ${data.mint_address||'mint unavailable'}`;
      case 'pumpswap_activity':return `PumpSwap ${data.event_type||'activity'}: ${data.pool_address||'pool unresolved'}`;
      case 'pumpswap_volume_update':return `PumpSwap volume updated for pool ${data.pool_address||'unknown'}`;
      case 'token_scan_started':return `Security scan started: ${data.mint_address||'unknown mint'}`;
      case 'token_scan_update':return `Security scan updated: ${data.mint_address||'unknown mint'}`;
      case 'diagnostic':return data.message||'Backend diagnostic';
      case 'connection_status':return 'Connected to NodeX backend event stream';
      case 'engine_state':return `Engine ${data.paused?'paused':'running'} in ${data.mode||'paper'} mode`;
      default:return type.replace(/_/g,' ');
    }
  }
  private scheduleReconnect():void {
    if(this.manuallyClosed||this.reconnectTimer)return;
    const delay=Math.min(30000,1000*(2**Math.min(this.reconnectAttempts,5)));
    this.reconnectAttempts++;this.setStatus('reconnecting',0);
    this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.connect();},delay);
  }
  public disconnect():void {
    this.manuallyClosed=true;if(this.reconnectTimer)clearTimeout(this.reconnectTimer);
    this.reconnectTimer=null;this.ws?.close();this.ws=null;this.setStatus('disconnected',0);
  }
  public sendCommand(command:'pause'|'resume'|'start'|'status'|'set_mode',mode?:'paper'):boolean {
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;
    this.ws.send(JSON.stringify(mode?{command,mode}:{command}));return true;
  }
  public send(payload:{command:string;mode?:string}):void {
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
