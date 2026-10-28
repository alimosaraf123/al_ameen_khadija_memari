const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', '..', 'al_ameen_khadija_memari_old', 'src', 'app', 'gateman.tsx');
let content = fs.readFileSync(targetFile, 'utf8');

// 1. Add state and handlers
const stateInsert = `
  const [isOnDuty, setIsOnDuty] = useState(false);
  const [dutyStartTime, setDutyStartTime] = useState<string | null>(null);
  const [dutyBusy, setDutyBusy] = useState(false);

  const checkDutyStatus = async () => {
    try {
      const res = await api('/api/service-panels/gate-duty/status');
      if (res?.on_duty) {
        setIsOnDuty(true);
        setDutyStartTime(res.start_time);
      }
    } catch {}
  };

  const handleStartDuty = async () => {
    setDutyBusy(true);
    try {
      const res = await api('/api/service-panels/gate-duty/start', { method: 'POST' });
      setIsOnDuty(true);
      setDutyStartTime(res.start_time);
      setShowGreetingModal(false);
      Alert.alert('Gate Duty Started', 'ডিউটি শুরু হয়েছে এবং Staff Attendance-এ আপনি Present হিসেবে রেকর্ড হয়েছেন!');
    } catch (e: any) {
      Alert.alert('Duty Start Error', e.message || 'Could not record duty start.');
    } finally {
      setDutyBusy(false);
    }
  };

  const handleEndDuty = async () => {
    const confirmed = await confirmAction('End Gate Duty', 'আপনি কি আজকের গেট ডিউটি সমাপ্ত করতে চান?');
    if (!confirmed) return;
    setDutyBusy(true);
    try {
      await api('/api/service-panels/gate-duty/end', { method: 'POST' });
      setIsOnDuty(false);
      Alert.alert('Gate Duty Ended', 'আজকের গেট ডিউটি সমাপ্ত হয়েছে।');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setDutyBusy(false);
    }
  };
`;

if (!content.includes('const handleStartDuty = async () => {')) {
  content = content.replace(
    'const cleanBarcode = (val: string) => {',
    stateInsert + '\n  const cleanBarcode = (val: string) => {'
  );
}

// 2. Call checkDutyStatus on mount
if (!content.includes('void checkDutyStatus();')) {
  content = content.replace(
    'void loadToday();',
    'void loadToday();\n    void checkDutyStatus();'
  );
}

// 3. Connect greetingStartButton to handleStartDuty
content = content.replace(
  `              {/* Continue button */}
              <TouchableOpacity
                style={s.greetingStartButton}
                onPress={() => setShowGreetingModal(false)}
              >
                <Text style={s.greetingStartButtonText}>
                  ডিউটি শুরু করুন (Start Gate Duty) →
                </Text>
              </TouchableOpacity>`,
  `              {/* Continue button */}
              <TouchableOpacity
                style={s.greetingStartButton}
                onPress={handleStartDuty}
                disabled={dutyBusy}
              >
                <Text style={s.greetingStartButtonText}>
                  {dutyBusy ? 'রেকর্ড হচ্ছে...' : 'ডিউটি শুরু করুন ও হাজিরা দিন (Start Gate Duty) →'}
                </Text>
              </TouchableOpacity>`
);

// 4. Update Duty Banner
const oldBanner = `<View style={{ flex: 1, minWidth: 200 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={s.dutyGreetingSalutation}>
                  {timeGreeting.icon} {timeGreeting.bengali},
                </Text>
                <View style={s.dutyActiveChip}>
                  <Text style={s.dutyActiveChipText}>🟢 অন-ডিউটি (On Duty)</Text>
                </View>
              </View>
              <Text style={s.dutyGatemanName} numberOfLines={1}>
                {gatemanName}
              </Text>
              <Text style={s.dutySubDetails}>
                Gate Security · Login: <Text style={{ color: '#fff', fontWeight: '800' }}>{gatemanLoginId}</Text> · Staff ID: 786786
              </Text>
            </View>`;

const newBanner = `<View style={{ flex: 1, minWidth: 200 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={s.dutyGreetingSalutation}>
                  {timeGreeting.icon} {timeGreeting.bengali},
                </Text>
                <View style={[s.dutyActiveChip, !isOnDuty && { backgroundColor: '#fef3c7' }]}>
                  <Text style={[s.dutyActiveChipText, !isOnDuty && { color: '#b45309' }]}>
                    {isOnDuty ? '🟢 অন-ডিউটি (On Duty · Present)' : '🟡 ডিউটি শুরু হয়নি (Off Duty)'}
                  </Text>
                </View>
              </View>
              <Text style={s.dutyGatemanName} numberOfLines={1}>
                {gatemanName}
              </Text>
              <Text style={s.dutySubDetails}>
                Gate Security · Login: <Text style={{ color: '#fff', fontWeight: '800' }}>{gatemanLoginId}</Text> · Staff ID: {currentUser?.staff_id || '786786'}
              </Text>
              {dutyStartTime && (
                <Text style={{ color: '#a5f3fc', fontSize: 11, marginTop: 2, fontWeight: '700' }}>
                  ⏱️ ডিউটি শুরু: {new Date(dutyStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · হাজিরা: Present
                </Text>
              )}
            </View>
            <View style={{ justifyContent: 'center' }}>
              {isOnDuty ? (
                <TouchableOpacity
                  style={{ backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                  onPress={handleEndDuty}
                  disabled={dutyBusy}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>
                    {dutyBusy ? 'Wait...' : '🔴 ডিউটি সমাপ্ত করুন'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={{ backgroundColor: '#16a34a', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 }}
                  onPress={handleStartDuty}
                  disabled={dutyBusy}
                >
                  <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                    {dutyBusy ? 'রেকর্ড হচ্ছে...' : '🟢 ডিউটি শুরু করুন'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>`;

if (content.includes(oldBanner)) {
  content = content.replace(oldBanner, newBanner);
}

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Successfully patched gateman.tsx');
