const { exec } = require('child_process');
const path = require('path');

const ADB_PATH = process.env.ADB_PATH || 'C:\\Users\\User\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';

function execCommand(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 8000 }, (err, stdout, stderr) => {
      resolve({
        error: err ? err.message : null,
        stdout: stdout ? stdout.trim() : '',
        stderr: stderr ? stderr.trim() : ''
      });
    });
  });
}

/**
 * Get the first active connected ADB device
 */
async function getConnectedDevice() {
  try {
    const res = await execCommand(`"${ADB_PATH}" devices`);
    if (res.stdout) {
      const lines = res.stdout.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.includes('device') && !line.includes('List of devices') && !line.includes('offline') && !line.includes('unauthorized')) {
          const parts = line.split(/\s+/);
          if (parts[0]) return parts[0];
        }
      }
    }
  } catch (e) {
    console.warn('[GSM ADB] Error detecting device:', e.message);
  }
  return null;
}

/**
 * Place a real GSM voice call using the connected Android device
 */
async function dialNumber(phoneNumber) {
  const cleanNumber = String(phoneNumber || '').replace(/[^\d+]/g, '');
  if (!cleanNumber) {
    return { success: false, message: 'Invalid phone number' };
  }

  const deviceId = await getConnectedDevice();
  if (!deviceId) {
    console.log('[GSM ADB] No Android device connected via ADB. Simulator mode only.');
    return { success: false, reason: 'no_device_connected' };
  }

  console.log(`[GSM ADB] Placing real GSM call to ${cleanNumber} via Android device: ${deviceId}`);
  
  // am start -a android.intent.action.CALL -d tel:XXXX
  const callCmd = `"${ADB_PATH}" -s ${deviceId} shell am start -a android.intent.action.CALL -d tel:${cleanNumber}`;
  const callRes = await execCommand(callCmd);

  if (callRes.error || (callRes.stderr && callRes.stderr.toLowerCase().includes('error'))) {
    console.error('[GSM ADB] Failed to place call:', callRes.error || callRes.stderr);
    return { success: false, error: callRes.error || callRes.stderr, deviceId };
  }

  return {
    success: true,
    deviceId,
    phoneNumber: cleanNumber,
    rawOutput: callRes.stdout
  };
}

/**
 * Hang up the active call on the connected Android device
 */
async function hangUpCall() {
  const deviceId = await getConnectedDevice();
  if (!deviceId) {
    return { success: false, reason: 'no_device_connected' };
  }

  console.log(`[GSM ADB] Hanging up active call on Android device: ${deviceId}`);
  const endCmd = `"${ADB_PATH}" -s ${deviceId} shell input keyevent KEYCODE_ENDCALL`;
  const endRes = await execCommand(endCmd);

  return {
    success: true,
    deviceId,
    rawOutput: endRes.stdout
  };
}

module.exports = {
  getConnectedDevice,
  dialNumber,
  hangUpCall
};
