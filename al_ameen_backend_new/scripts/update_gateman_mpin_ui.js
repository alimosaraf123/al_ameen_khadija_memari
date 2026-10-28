const fs = require('fs');
const path = require('path');

const indexFile = path.resolve(__dirname, '../../al_ameen_khadija_memari_old/src/app/index.tsx');
let content = fs.readFileSync(indexFile, 'utf8');

// 1. Update quickHelp text
content = content.replace(
  `{fingerprintRole === 'gateman'\r\n                ? 'Scan your fingerprint to open the Gateman Scanner.'\r\n                : 'Log in with mPIN or Fingerprint.'}`,
  `{fingerprintRole === 'gateman'\r\n                ? 'Log in with Fingerprint or 6-digit mPIN.'\r\n                : 'Log in with mPIN or Fingerprint.'}`
);
content = content.replace(
  `{fingerprintRole === 'gateman'\n                ? 'Scan your fingerprint to open the Gateman Scanner.'\n                : 'Log in with mPIN or Fingerprint.'}`,
  `{fingerprintRole === 'gateman'\n                ? 'Log in with Fingerprint or 6-digit mPIN.'\n                : 'Log in with mPIN or Fingerprint.'}`
);

// 2. Remove {fingerprintRole !== 'gateman' && ( around OR text
content = content.replace(
  `                {fingerprintRole !== 'gateman' && (\r\n                  <Text\r\n                    style={styles.orText}\r\n                  >\r\n                    OR\r\n                  </Text>\r\n                )}`,
  `                <Text style={styles.orText}>OR</Text>`
);
content = content.replace(
  `                {fingerprintRole !== 'gateman' && (\n                  <Text\n                    style={styles.orText}\n                  >\n                    OR\n                  </Text>\n                )}`,
  `                <Text style={styles.orText}>OR</Text>`
);

// 3. Remove {fingerprintRole !== 'gateman' && ( around MPIN input so Gateman has mPIN!
content = content.replace(
  `            {/* MPIN (Guardian only) */}\r\n\r\n            {fingerprintRole !== 'gateman' && (`,
  `            {/* MPIN */}`
);
content = content.replace(
  `            {/* MPIN (Guardian only) */}\n\n            {fingerprintRole !== 'gateman' && (`,
  `            {/* MPIN */}`
);

// Remove closing tag of that block
content = content.replace(
  `                  onPress={\r\n                    loginWithMpin\r\n                  }\r\n\r\n                />\r\n              </>\r\n            )}`,
  `                  onPress={\r\n                    loginWithMpin\r\n                  }\r\n\r\n                />`
);
content = content.replace(
  `                  onPress={\n                    loginWithMpin\n                  }\n\n                />\n              </>\n            )}`,
  `                  onPress={\n                    loginWithMpin\n                  }\n\n                />`
);

// 4. In Quick Login mode, add Gateman picker row right below quickHelp
const quickHelpTargetLF = `<Text\n              style={styles.quickHelp}\n            >\n              {fingerprintRole === 'gateman'\n                ? 'Log in with Fingerprint or 6-digit mPIN.'\n                : 'Log in with mPIN or Fingerprint.'}\n            </Text>`;
const quickHelpTargetCRLF = quickHelpTargetLF.replace(/\n/g, '\r\n');

const pickerInQuickLogin = `{Platform.OS !== 'web' && (
              <View style={styles.gatemanPickerRow}>
                {[
                  { id: 'gateman01', label: 'Gateman 1' },
                  { id: 'gateman02', label: 'Gateman 2' },
                  { id: 'gateman03', label: 'Gateman 3' },
                  { id: 'gateman04', label: 'Gateman 4' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => {
                      setGuardianLoginId(item.id);
                      setUserId(item.id);
                      setFingerprintRole('gateman');
                      setLoginError('');
                    }}
                    style={[
                      styles.gatemanPickerBtn,
                      (guardianLoginId || userId) === item.id && styles.gatemanPickerBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.gatemanPickerText,
                        (guardianLoginId || userId) === item.id && styles.gatemanPickerTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}`;

if (content.includes(quickHelpTargetCRLF)) {
  content = content.replace(quickHelpTargetCRLF, quickHelpTargetCRLF + '\r\n\r\n            ' + pickerInQuickLogin.replace(/\n/g, '\r\n'));
  console.log('Added Gateman picker into Quick Login view (CRLF)');
} else if (content.includes(quickHelpTargetLF)) {
  content = content.replace(quickHelpTargetLF, quickHelpTargetLF + '\n\n            ' + pickerInQuickLogin);
  console.log('Added Gateman picker into Quick Login view (LF)');
} else {
  console.log('Could not find quickHelp target');
}

// 5. Update loginWithMpin to support Gateman loginId
const oldMpinCheck = `      if (!guardianLoginId) {\r\n\r\n        Alert.alert(\r\n          'Guardian Account',\r\n          'Guardian account is not saved on this device.'\r\n        );\r\n\r\n        setUsePasswordLogin(\r\n          true\r\n        );\r\n\r\n        return;\r\n\r\n      }`;
const newMpinCheck = `      const activeLoginId = guardianLoginId || userId || (Platform.OS !== 'web' ? 'gateman01' : '');\r\n      if (!activeLoginId) {\r\n        Alert.alert('Account Required', 'Please select or enter your User ID.');\r\n        setUsePasswordLogin(true);\r\n        return;\r\n      }`;

if (content.includes(oldMpinCheck)) {
  content = content.replace(oldMpinCheck, newMpinCheck);
  console.log('Updated loginWithMpin check (CRLF)');
} else if (content.includes(oldMpinCheck.replace(/\r\n/g, '\n'))) {
  content = content.replace(oldMpinCheck.replace(/\r\n/g, '\n'), newMpinCheck.replace(/\r\n/g, '\n'));
  console.log('Updated loginWithMpin check (LF)');
}

// Update body in loginWithMpin fetch:
content = content.replace(
  "                  login_id:\r\n                    guardianLoginId,",
  "                  login_id:\r\n                    activeLoginId,"
);
content = content.replace(
  "                  login_id:\n                    guardianLoginId,",
  "                  login_id:\n                    activeLoginId,"
);

// 6. Update loginWithMpin response handling for gateman
const oldMpinSuccess = `        await saveGuardianDeviceAccount(\r\n          loginId\r\n        );\r\n\r\n\r\n        setGuardianLoginId(\r\n          loginId\r\n        );\r\n\r\n\r\n        setMpin('');\r\n\r\n\r\n        router.replace(panelForRole(data.user.role) as any);`;
const newMpinSuccess = `        await saveGuardianDeviceAccount(savedLoginId);\r\n        setGuardianLoginId(savedLoginId);\r\n        if (data.user.role === 'gateman' && Platform.OS !== 'web') {\r\n          try {\r\n            const hasHw = await LocalAuthentication.hasHardwareAsync();\r\n            const isEn = await LocalAuthentication.isEnrolledAsync();\r\n            if (hasHw && isEn) {\r\n              const bioReg = await api('/api/biometric/register', {\r\n                method: 'POST',\r\n                body: JSON.stringify({ device_name: \`Gateman Device (\${savedLoginId})\` })\r\n              });\r\n              if (bioReg?.device_token) {\r\n                await saveRoleBiometricToken('gateman', bioReg.device_token, savedLoginId);\r\n              }\r\n            }\r\n          } catch (bioErr) { console.log('Biometric setup err:', bioErr); }\r\n        }\r\n        setMpin('');\r\n        router.replace(panelForRole(data.user.role) as any);`;

if (content.includes(oldMpinSuccess)) {
  content = content.replace(oldMpinSuccess, newMpinSuccess);
  console.log('Updated mPIN success handling for Gateman (CRLF)');
} else if (content.includes(oldMpinSuccess.replace(/\r\n/g, '\n'))) {
  content = content.replace(oldMpinSuccess.replace(/\r\n/g, '\n'), newMpinSuccess.replace(/\r\n/g, '\n'));
  console.log('Updated mPIN success handling for Gateman (LF)');
}

// 7. Refine auto-prompt for fingerprint so it only prompts if token exists
const oldAutoPrompt = `  useEffect(() => {\r\n    if (\r\n      fingerprintRole === 'gateman' &&\r\n      fingerprintAvailable &&\r\n      !usePasswordLogin &&\r\n      Platform.OS !== 'web'\r\n    ) {\r\n      const timer = setTimeout(() => {\r\n        void loginWithFingerprint();\r\n      }, 500);\r\n      return () => clearTimeout(timer);\r\n    }\r\n  }, [fingerprintRole, fingerprintAvailable, usePasswordLogin]);`;
const newAutoPrompt = `  useEffect(() => {\r\n    if (\r\n      fingerprintRole === 'gateman' &&\r\n      fingerprintAvailable &&\r\n      !usePasswordLogin &&\r\n      Platform.OS !== 'web'\r\n    ) {\r\n      void getRoleBiometricToken('gateman').then((token) => {\r\n        if (token) {\r\n          const timer = setTimeout(() => {\r\n            void loginWithFingerprint();\r\n          }, 500);\r\n          return () => clearTimeout(timer);\r\n        }\r\n      });\r\n    }\r\n  }, [fingerprintRole, fingerprintAvailable, usePasswordLogin]);`;

if (content.includes(oldAutoPrompt)) {
  content = content.replace(oldAutoPrompt, newAutoPrompt);
  console.log('Updated auto-prompt (CRLF)');
} else if (content.includes(oldAutoPrompt.replace(/\r\n/g, '\n'))) {
  content = content.replace(oldAutoPrompt.replace(/\r\n/g, '\n'), newAutoPrompt.replace(/\r\n/g, '\n'));
  console.log('Updated auto-prompt (LF)');
}

fs.writeFileSync(indexFile, content, 'utf8');
console.log('index.tsx updated successfully!');
