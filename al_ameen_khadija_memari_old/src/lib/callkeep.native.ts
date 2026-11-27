export interface CallKeepOptions {
  onAnswerCall?: (callId: string, data: any) => void;
  onEndCall?: (callId: string) => void;
}

// In-app native CallKeep/ConnectionService disabled so Play Store does not require Foreground Service declarations.
export async function setupCallKeep(_options: CallKeepOptions = {}) {}

export function displayIncomingCall(_callId: string, _callerName: string, _meta: any = {}) {}

export function endCallKeepCall(_callId: string) {}

export function setCallConnected(_callId: string) {}

export default {
  setupCallKeep,
  displayIncomingCall,
  endCallKeepCall,
  setCallConnected,
};
