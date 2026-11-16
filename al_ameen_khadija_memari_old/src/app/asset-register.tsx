import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import { Field } from '../components/ui';
import { api, API_BASE } from '../lib/api';
import { getToken } from '../lib/auth';

const blank = {
  asset_id: '',
  name: '',
  category: '',
  quantity: '1',
  specifications: '',
  purchase_date: '',
  bill_no: '',
  vendor_name: '',
  purchase_price: '0',
  annual_depreciation_rate: '0',
  allocation: '',
  custodian: ''
};

export default function AssetRegister() {
  const [form, setForm] = useState<any>(blank);
  const [assets, setAssets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [maintenance, setMaintenance] = useState<any>(null);
  const [maint, setMaint] = useState({ description: '', cost: '', maintenance_date: '', vendor_name: '' });
  const [invoice, setInvoice] = useState<any>(null);

  const set = (k: string, v: string) => setForm((x: any) => ({ ...x, [k]: v }));

  const load = async () => {
    try {
      const d = await api('/api/assets');
      setAssets(d.assets || []);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to load assets');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const categories = useMemo(() => {
    const setCats = new Set<string>();
    assets.forEach((a) => {
      if (a.category && a.category.trim()) setCats.add(a.category.trim());
    });
    return ['ALL', ...Array.from(setCats)];
  }, [assets]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      const matchesCat = selectedCategory === 'ALL' || a.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        (a.name && a.name.toLowerCase().includes(q)) ||
        (a.asset_id && String(a.asset_id).toLowerCase().includes(q)) ||
        (a.category && a.category.toLowerCase().includes(q)) ||
        (a.allocation && a.allocation.toLowerCase().includes(q)) ||
        (a.custodian && a.custodian.toLowerCase().includes(q)) ||
        (a.specifications && a.specifications.toLowerCase().includes(q))
      );
    });
  }, [assets, search, selectedCategory]);

  const stats = useMemo(() => {
    const totalTypes = assets.length;
    const totalQuantity = assets.reduce((sum, a) => sum + (Number(a.quantity) || 1), 0);
    const active = assets.filter((a) => a.status !== 'Disposed').length;
    const disposed = assets.filter((a) => a.status === 'Disposed').length;
    return { totalTypes, totalQuantity, active, disposed };
  }, [assets]);

  const add = async () => {
    if (!form.asset_id.trim() || !form.name.trim()) {
      return Alert.alert('Validation Error', 'Barcode / Asset ID and Asset Name are required.');
    }
    setBusy(true);
    try {
      await api('/api/assets', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          quantity: Math.max(1, parseInt(form.quantity, 10) || 1),
          purchase_price: Number(form.purchase_price || 0),
          annual_depreciation_rate: Number(form.annual_depreciation_rate || 0)
        })
      });
      setForm(blank);
      setShowAddForm(false);
      await load();
      Alert.alert('Saved', 'Asset registered successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add asset');
    } finally {
      setBusy(false);
    }
  };

  const pickInvoice = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true
      });
      if (!picked.canceled && picked.assets?.[0]) setInvoice(picked.assets[0]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const uploadInvoice = async (a: any) => {
    if (!invoice) return Alert.alert('Invoice', 'Choose a bill or invoice file first.');
    setBusy(true);
    try {
      const token = await getToken();
      const fd = new FormData();
      if (Platform.OS === 'web' && (invoice as any).file) {
        fd.append('file', (invoice as any).file);
      } else {
        fd.append('file', {
          uri: invoice.uri,
          name: invoice.name || 'invoice',
          type: invoice.mimeType || 'application/octet-stream'
        } as any);
      }
      const response = await fetch(API_BASE + '/api/assets/' + a.id + '/invoice', {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: fd
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Invoice upload failed');
      setInvoice(null);
      await load();
      Alert.alert('Saved', 'Bill / invoice uploaded successfully.');
    } catch (e: any) {
      Alert.alert('Invoice Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const depreciation = async (a: any) => {
    try {
      await api(`/api/assets/${a.id}/depreciation`, { method: 'POST', body: JSON.stringify({}) });
      await load();
      Alert.alert('Updated', 'Depreciation updated.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const saveMaintenance = async () => {
    if (!maint.description.trim()) {
      return Alert.alert('Validation', 'Maintenance description is required.');
    }
    try {
      await api(`/api/assets/${maintenance.id}/maintenance`, {
        method: 'POST',
        body: JSON.stringify(maint)
      });
      setMaintenance(null);
      setMaint({ description: '', cost: '', maintenance_date: '', vendor_name: '' });
      await load();
      Alert.alert('Saved', 'Maintenance record added.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const dispose = async (a: any) => {
    if (Platform.OS === 'web') {
      const ok = window.confirm(`Are you sure you want to mark "${a.name}" as Disposed?`);
      if (!ok) return;
    }
    try {
      await api(`/api/assets/${a.id}/disposal`, {
        method: 'POST',
        body: JSON.stringify({ disposal_reason: 'Disposed from register' })
      });
      await load();
      Alert.alert('Disposed', `${a.name} marked as disposed.`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <AcademyHeader />

      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.push('/superadmin' as any)}>
          <Text style={s.backBtnText}>‹ Back to Dashboard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.toggleAddBtn}
          onPress={() => setShowAddForm((prev) => !prev)}
        >
          <Text style={s.toggleAddBtnText}>
            {showAddForm ? '✕ Close Form' : '+ Register New Asset'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={s.headerBox}>
        <View>
          <Text style={s.title}>🏛️ Asset Register</Text>
          <Text style={s.subtitle}>
            Manage and track campus equipment, electronics, furniture & lighting
          </Text>
        </View>
      </View>

      {/* KPI Stats Bar */}
      <View style={s.statsRow}>
        <View style={[s.statCard, { borderLeftColor: '#2563eb' }]}>
          <Text style={s.statNum}>{stats.totalTypes}</Text>
          <Text style={s.statLabel}>Asset Types</Text>
        </View>
        <View style={[s.statCard, { borderLeftColor: '#059669' }]}>
          <Text style={[s.statNum, { color: '#059669' }]}>{stats.totalQuantity}</Text>
          <Text style={s.statLabel}>Total Units / Quantity</Text>
        </View>
        <View style={[s.statCard, { borderLeftColor: '#16a34a' }]}>
          <Text style={[s.statNum, { color: '#16a34a' }]}>{stats.active}</Text>
          <Text style={s.statLabel}>Active Assets</Text>
        </View>
        <View style={[s.statCard, { borderLeftColor: '#dc2626' }]}>
          <Text style={[s.statNum, { color: '#dc2626' }]}>{stats.disposed}</Text>
          <Text style={s.statLabel}>Disposed</Text>
        </View>
      </View>

      {/* Add New Asset Form */}
      {showAddForm && (
        <View style={s.card}>
          <Text style={s.heading}>📝 Register New Asset Item</Text>
          <View style={s.formGrid}>
            <View style={s.formCol}>
              <Field
                placeholder="Barcode / Asset ID * (e.g. 012)"
                value={form.asset_id}
                onChangeText={(v: string) => set('asset_id', v)}
              />
              <Field
                placeholder="Asset Name * (e.g. CCTV, Fan, AC)"
                value={form.name}
                onChangeText={(v: string) => set('name', v)}
              />
              <Field
                placeholder="Quantity (e.g. 10, 44, 200)"
                value={form.quantity}
                onChangeText={(v: string) => set('quantity', v)}
                keyboardType="numeric"
              />
              <Field
                placeholder="Specifications / Model (e.g. 3 phase-1)"
                value={form.specifications}
                onChangeText={(v: string) => set('specifications', v)}
              />
              <Field
                placeholder="Category (e.g. Electrical / Lighting)"
                value={form.category}
                onChangeText={(v: string) => set('category', v)}
              />
              <Field
                placeholder="Allocation / Location (e.g. Campus Ground)"
                value={form.allocation}
                onChangeText={(v: string) => set('allocation', v)}
              />
            </View>
            <View style={s.formCol}>
              <Field
                placeholder="Custodian / Caretaker"
                value={form.custodian}
                onChangeText={(v: string) => set('custodian', v)}
              />
              <Field
                placeholder="Purchase Date (YYYY-MM-DD)"
                value={form.purchase_date}
                onChangeText={(v: string) => set('purchase_date', v)}
              />
              <Field
                placeholder="Bill / Invoice Number"
                value={form.bill_no}
                onChangeText={(v: string) => set('bill_no', v)}
              />
              <Field
                placeholder="Vendor Name"
                value={form.vendor_name}
                onChangeText={(v: string) => set('vendor_name', v)}
              />
              <Field
                placeholder="Purchase Price (₹ Total / Unit)"
                value={form.purchase_price}
                onChangeText={(v: string) => set('purchase_price', v)}
                keyboardType="numeric"
              />
              <Field
                placeholder="Annual Depreciation % (e.g. 10)"
                value={form.annual_depreciation_rate}
                onChangeText={(v: string) => set('annual_depreciation_rate', v)}
                keyboardType="numeric"
              />
            </View>
          </View>

          {invoice && (
            <View style={s.selectedInvoiceBadge}>
              <Text style={s.selectedInvoiceText}>📎 Attached: {invoice.name}</Text>
            </View>
          )}

          <View style={s.formActions}>
            <TouchableOpacity style={s.invoicePicker} onPress={pickInvoice}>
              <Text style={s.white}>📎 Choose Bill / Invoice File</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} style={s.submitBtn} onPress={add}>
              <Text style={s.white}>{busy ? 'Saving...' : '💾 Save Asset'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Search and Filters */}
      <View style={s.searchBar}>
        <TextInput
          style={s.searchInput}
          placeholder="🔍 Search assets by name, ID, category, or location..."
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={s.clearSearch}>
            <Text style={s.clearText}>✕ Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category Pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.categoryScroll}>
        {categories.map((c) => (
          <TouchableOpacity
            key={c}
            style={[s.categoryChip, selectedCategory === c && s.categoryChipActive]}
            onPress={() => setSelectedCategory(c)}
          >
            <Text
              style={[
                s.categoryChipText,
                selectedCategory === c && s.categoryChipTextActive
              ]}
            >
              {c === 'ALL' ? 'All Categories' : c}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Asset List Heading */}
      <View style={s.listHeaderRow}>
        <Text style={s.heading}>
          📋 Registered Assets ({filteredAssets.length} of {assets.length})
        </Text>
      </View>

      {/* Asset Cards */}
      {filteredAssets.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyText}>No assets found matching your criteria.</Text>
        </View>
      ) : (
        filteredAssets.map((a) => (
          <View key={a.id} style={s.assetCard}>
            <View style={s.assetTop}>
              <View style={s.assetTitleGroup}>
                <View style={s.idBadge}>
                  <Text style={s.idBadgeText}>#{a.asset_id}</Text>
                </View>
                <Text style={s.assetName}>{a.name}</Text>
                {a.quantity > 0 && (
                  <View style={s.qtyBadge}>
                    <Text style={s.qtyBadgeText}>Qty: {a.quantity} nos</Text>
                  </View>
                )}
                {a.specifications ? (
                  <View style={s.specBadge}>
                    <Text style={s.specBadgeText}>{a.specifications}</Text>
                  </View>
                ) : null}
              </View>
              <View
                style={[
                  s.statusPill,
                  a.status === 'Disposed' ? s.statusDisposed : s.statusActive
                ]}
              >
                <Text
                  style={[
                    s.statusPillText,
                    a.status === 'Disposed' ? s.statusDisposedText : s.statusActiveText
                  ]}
                >
                  {a.status || 'Active'}
                </Text>
              </View>
            </View>

            <View style={s.assetDetailsGrid}>
              <View style={s.detailCol}>
                <Text style={s.detailLabel}>Category</Text>
                <Text style={s.detailValue}>{a.category || 'General / Uncategorized'}</Text>
              </View>
              <View style={s.detailCol}>
                <Text style={s.detailLabel}>Allocation / Location</Text>
                <Text style={s.detailValue}>{a.allocation || 'Campus & Hostel'}</Text>
              </View>
              <View style={s.detailCol}>
                <Text style={s.detailLabel}>Custodian</Text>
                <Text style={s.detailValue}>{a.custodian || '-'}</Text>
              </View>
              <View style={s.detailCol}>
                <Text style={s.detailLabel}>Purchase Price / Value</Text>
                <Text style={s.detailValue}>
                  ₹ {Number(a.purchase_price || 0).toLocaleString()} (Book: ₹{' '}
                  {Number(a.book_value || 0).toLocaleString()})
                </Text>
              </View>
            </View>

            {/* Maintenance records if any */}
            {Array.isArray(a.maintenance) && a.maintenance.length > 0 && (
              <View style={s.maintBox}>
                <Text style={s.maintTitle}>🛠️ Maintenance History ({a.maintenance.length}):</Text>
                {a.maintenance.slice(0, 3).map((m: any, idx: number) => (
                  <Text key={idx} style={s.maintItem}>
                    • {String(m.maintenance_date).substring(0, 10)}: {m.description} (₹{m.cost || 0})
                  </Text>
                ))}
              </View>
            )}

            <View style={s.actions}>
              <TouchableOpacity style={s.btnDepreciation} onPress={() => depreciation(a)}>
                <Text style={s.actionBtnText}>📉 Recalculate Depr.</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnMaint} onPress={() => setMaintenance(a)}>
                <Text style={s.actionBtnText}>🛠️ Add Maintenance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.btnInvoice} onPress={() => uploadInvoice(a)}>
                <Text style={s.actionBtnText}>
                  {a.bill_file_url ? '📄 Replace Bill' : '📎 Upload Bill'}
                </Text>
              </TouchableOpacity>
              {a.bill_file_url && (
                <TouchableOpacity
                  style={s.btnViewInvoice}
                  onPress={() => {
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                      window.open(API_BASE + a.bill_file_url, '_blank');
                    }
                  }}
                >
                  <Text style={s.actionBtnText}>👁️ View Bill</Text>
                </TouchableOpacity>
              )}
              {a.status !== 'Disposed' && (
                <TouchableOpacity style={s.btnDispose} onPress={() => dispose(a)}>
                  <Text style={s.actionBtnText}>🗑️ Dispose</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))
      )}

      {/* Maintenance Modal */}
      {maintenance && (
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalHeading}>🛠️ Add Maintenance: {maintenance.name}</Text>
            <Text style={s.modalSub}>
              ID: {maintenance.asset_id} | Qty: {maintenance.quantity || 1}
            </Text>
            <Field
              placeholder="Description of issue / maintenance *"
              value={maint.description}
              onChangeText={(v: string) => setMaint((x) => ({ ...x, description: v }))}
              multiline
            />
            <Field
              placeholder="Cost (₹)"
              value={maint.cost}
              onChangeText={(v: string) => setMaint((x) => ({ ...x, cost: v }))}
              keyboardType="numeric"
            />
            <Field
              placeholder="Service Vendor / Technician"
              value={maint.vendor_name}
              onChangeText={(v: string) => setMaint((x) => ({ ...x, vendor_name: v }))}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.submitBtn} onPress={saveMaintenance}>
                <Text style={s.white}>Save Maintenance</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setMaintenance(null)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { padding: 16, maxWidth: 1200, width: '100%', alignSelf: 'center', paddingBottom: 60 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 10
  },
  backBtn: {
    backgroundColor: '#e2e8f0',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  backBtnText: { color: '#0f172a', fontWeight: '700', fontSize: 14 },
  toggleAddBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  toggleAddBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  headerBox: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2
  },
  title: { fontSize: 24, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#64748b' },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  statNum: { fontSize: 22, fontWeight: '900', color: '#0f172a' },
  statLabel: { fontSize: 12, color: '#64748b', fontWeight: '600', marginTop: 2 },
  card: {
    backgroundColor: '#ffffff',
    padding: 18,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  heading: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 12 },
  formGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14
  },
  formCol: {
    flex: 1,
    minWidth: 280
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    alignItems: 'center'
  },
  invoicePicker: {
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  submitBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8
  },
  white: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  selectedInvoiceBadge: {
    backgroundColor: '#dcfce7',
    padding: 8,
    borderRadius: 6,
    marginVertical: 6
  },
  selectedInvoiceText: { color: '#166534', fontWeight: '700', fontSize: 13 },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginBottom: 12
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0f172a'
  },
  clearSearch: { padding: 6 },
  clearText: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  categoryScroll: {
    marginBottom: 14
  },
  categoryChip: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    marginRight: 8
  },
  categoryChipActive: {
    backgroundColor: '#2563eb'
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155'
  },
  categoryChipTextActive: {
    color: '#ffffff'
  },
  listHeaderRow: {
    marginBottom: 10
  },
  emptyBox: {
    backgroundColor: '#ffffff',
    padding: 30,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  emptyText: { color: '#64748b', fontSize: 15, fontWeight: '600' },
  assetCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1
  },
  assetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8
  },
  assetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8
  },
  idBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  idBadgeText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  assetName: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  qtyBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#93c5fd'
  },
  qtyBadgeText: { fontSize: 12, fontWeight: '800', color: '#1d4ed8' },
  specBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a'
  },
  specBadgeText: { fontSize: 12, fontWeight: '700', color: '#92400e' },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20
  },
  statusPillText: { fontSize: 12, fontWeight: '800' },
  statusActive: { backgroundColor: '#dcfce7' },
  statusActiveText: { color: '#15803d', fontWeight: '800', fontSize: 12 },
  statusDisposed: { backgroundColor: '#fee2e2' },
  statusDisposedText: { color: '#b91c1c', fontWeight: '800', fontSize: 12 },
  assetDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    marginVertical: 8
  },
  detailCol: {
    minWidth: 180,
    flex: 1
  },
  detailLabel: { fontSize: 11, color: '#64748b', fontWeight: '700', textTransform: 'uppercase' },
  detailValue: { fontSize: 13, color: '#1e293b', fontWeight: '600', marginTop: 2 },
  maintBox: {
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  maintTitle: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 4 },
  maintItem: { fontSize: 12, color: '#334155', marginVertical: 1 },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  btnDepreciation: {
    backgroundColor: '#6366f1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  btnMaint: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  btnInvoice: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  btnViewInvoice: {
    backgroundColor: '#0891b2',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  btnDispose: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  actionBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 12 },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    maxWidth: 500,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 8
  },
  modalHeading: { fontSize: 18, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  modalSub: { fontSize: 13, color: '#64748b', marginBottom: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { color: '#64748b', fontWeight: '700', fontSize: 14 }
});
