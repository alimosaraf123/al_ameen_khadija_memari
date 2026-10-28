const fs = require('fs');
const path = require('path');

// 1. Update gateman.tsx default photo
const gatemanFile = path.resolve(__dirname, '../../al_ameen_khadija_memari_old/src/app/gateman.tsx');
let gatemanContent = fs.readFileSync(gatemanFile, 'utf8');
const oldPhoto = "const DEFAULT_GATEMAN_PHOTO_URL = 'https://res.cloudinary.com/dftzjdhb/image/upload/v1793159487/staff/aparna_mondal.jpg';";
const newPhoto = "const DEFAULT_GATEMAN_PHOTO_URL = 'https://ui-avatars.com/api/?name=Gate+Man&background=0D8ABC&color=fff&size=200';";

if (gatemanContent.includes(oldPhoto)) {
  gatemanContent = gatemanContent.replace(oldPhoto, newPhoto);
  fs.writeFileSync(gatemanFile, gatemanContent, 'utf8');
  console.log('1. Updated gateman.tsx default photo fallback');
} else {
  console.log('1. Photo fallback already updated or not found');
}

// 2. Update strings.xml app name
const stringsFile = path.resolve(__dirname, '../../al_ameen_khadija_memari_old/android/app/src/main/res/values/strings.xml');
let stringsContent = fs.readFileSync(stringsFile, 'utf8');
if (stringsContent.includes('>Al-Ameen Mission Academy Memari<')) {
  stringsContent = stringsContent.replace('>Al-Ameen Mission Academy Memari<', '>Al-Ameen Gateman<');
  fs.writeFileSync(stringsFile, stringsContent, 'utf8');
  console.log('2. Updated strings.xml app_name to Al-Ameen Gateman');
} else {
  console.log('2. strings.xml already updated or not found');
}

// 3. Update index.tsx
const indexFile = path.resolve(__dirname, '../../al_ameen_khadija_memari_old/src/app/index.tsx');
let indexContent = fs.readFileSync(indexFile, 'utf8');

// Update initial userId
indexContent = indexContent.replace(
  "  const [userId, setUserId] =\r\n    useState('');",
  "  const [userId, setUserId] =\r\n    useState(Platform.OS !== 'web' ? 'gateman01' : '');"
);
indexContent = indexContent.replace(
  "  const [userId, setUserId] =\n    useState('');",
  "  const [userId, setUserId] =\n    useState(Platform.OS !== 'web' ? 'gateman01' : '');"
);

// Update biometric fallback on native devices to default to gateman
const oldBioFallback1 = `          } else if (
            (biometric || nativeBiometricReady) &&
            Platform.OS !== 'web'
          ) {
            setFingerprintAvailable(true);
            setFingerprintRole('guardian');
            setUsePasswordLogin(false);
          }`;

const newBioFallback = `          } else if (Platform.OS !== 'web') {
            setFingerprintAvailable(true);
            setFingerprintRole('gateman');
            setGuardianLoginId('gateman01');
            setUserId('gateman01');
            setUsePasswordLogin(false);
          }`;

if (indexContent.includes(oldBioFallback1)) {
  indexContent = indexContent.replace(oldBioFallback1, newBioFallback);
  console.log('3a. Updated biometric fallback to Gateman in index.tsx (LF)');
} else {
  // Try CRLF
  const oldBioFallbackCRLF = oldBioFallback1.replace(/\n/g, '\r\n');
  if (indexContent.includes(oldBioFallbackCRLF)) {
    indexContent = indexContent.replace(oldBioFallbackCRLF, newBioFallback.replace(/\n/g, '\r\n'));
    console.log('3a. Updated biometric fallback to Gateman in index.tsx (CRLF)');
  } else {
    console.log('3a. Biometric fallback pattern not matched directly, checking regex');
    indexContent = indexContent.replace(
      /\}\s*else\s*if\s*\(\s*\(biometric\s*\|\|\s*nativeBiometricReady\)\s*&&\s*Platform\.OS\s*!==\s*'web'\s*\)\s*\{[\s\S]*?setFingerprintRole\('guardian'\);[\s\S]*?setUsePasswordLogin\(false\);\s*\}/,
      `} else if (Platform.OS !== 'web') {
            setFingerprintAvailable(true);
            setFingerprintRole('gateman');
            setGuardianLoginId('gateman01');
            setUserId('gateman01');
            setUsePasswordLogin(false);
          }`
    );
    console.log('3a. Applied regex replacement for biometric fallback');
  }
}

// Add Gateman picker above User ID field if not already present
if (!indexContent.includes('gatemanPickerRow')) {
  const targetLabel = `<Text style={styles.fieldLabel}>User ID / Registration No.</Text>`;
  const gatemanPickerCode = `{Platform.OS !== 'web' && (
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
                      setUserId(item.id);
                      setLoginError('');
                    }}
                    style={[
                      styles.gatemanPickerBtn,
                      userId === item.id && styles.gatemanPickerBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.gatemanPickerText,
                        userId === item.id && styles.gatemanPickerTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <Text style={styles.fieldLabel}>User ID / Registration No.</Text>`;

  if (indexContent.includes(targetLabel)) {
    indexContent = indexContent.replace(targetLabel, gatemanPickerCode);
    console.log('3b. Added gatemanPickerRow to index.tsx');
  } else {
    console.log('3b. targetLabel for gatemanPickerRow not found');
  }

  // Add styles
  const styleAnchor = 'loginLogo: {';
  const newStyles = `gatemanPickerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 6,
    },
    gatemanPickerBtn: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 10,
      backgroundColor: '#f0f4f8',
      borderWidth: 1.5,
      borderColor: '#d0d7de',
      alignItems: 'center',
    },
    gatemanPickerBtnActive: {
      backgroundColor: '#005f73',
      borderColor: '#005f73',
    },
    gatemanPickerText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#475467',
    },
    gatemanPickerTextActive: {
      color: '#ffffff',
    },
    loginLogo: {`;

  if (indexContent.includes(styleAnchor)) {
    indexContent = indexContent.replace(styleAnchor, newStyles);
    console.log('3c. Added styles for gatemanPickerRow in index.tsx');
  }
}

fs.writeFileSync(indexFile, indexContent, 'utf8');
console.log('All updates written to disk successfully!');
