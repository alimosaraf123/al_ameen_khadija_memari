import * as WebCallKeep from './callkeep.web';

export interface CallKeepOptions {
  onAnswerCall?: (callId: string, data: any) => void;
  onEndCall?: (callId: string) => void;
}

export const setupCallKeep = WebCallKeep.setupCallKeep;
export const displayIncomingCall = WebCallKeep.displayIncomingCall;
export const endCallKeepCall = WebCallKeep.endCallKeepCall;
export const setCallConnected = WebCallKeep.setCallConnected;
export default WebCallKeep.default;

