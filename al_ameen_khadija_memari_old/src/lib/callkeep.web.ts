export interface CallKeepOptions {
  onAnswerCall?: (callId: string, data: any) => void;
  onEndCall?: (callId: string) => void;
}

export async function setupCallKeep(options: CallKeepOptions = {}) {
  return Promise.resolve();
}

export function displayIncomingCall(callId: string, callerName: string, meta: any = {}) {}

export function endCallKeepCall(callId: string) {}

export function setCallConnected(callId: string) {}

export default {
  setupCallKeep,
  displayIncomingCall,
  endCallKeepCall,
  setCallConnected,
};

