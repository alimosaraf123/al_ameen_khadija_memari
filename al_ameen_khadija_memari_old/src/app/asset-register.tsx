import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import ScrollNavigationButtons from '../components/ScrollNavigationButtons';
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

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const blankPurchase = () => ({
  quantity: '1',
  purchase_date: todayIso(),
  purchase_price: '',
  bill_no: '',
  vendor_name: '',
  allocation: '',
  specifications: '',
  notes: ''
});

export default function AssetRegister() {
  const scrollRef = useRef<ScrollView>(null);
  const [form, setForm] = useState<any>(blank);
  const [assets, setAssets] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [maintenance, setMaintenance] = useState<any>(null);
  const [maint, setMaint] = useState({ description: '', cost: '', maintenance_date: '', vendor_name: '' });
  const [invoice, setInvoice] = useState<any>(null);
  const [purchaseTarget, setPurchaseTarget] = useState<any>(null);
  const [purchaseForm, setPurchaseForm] = useState<any>(blankPurchase());
  const [purchaseBill, setPurchaseBill] = useState<any>(null);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({
    name: '',
    category: '',
    allocation: '',
    custodian: '',
    specifications: '',
    opening_quantity: ''
  });

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

  const filteredTotalQty = useMemo(
    () => filteredAssets.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0),
    [filteredAssets]
  );

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

  const openPurchaseModal = (a: any) => {
    setPurchaseTarget(a);
    setPurchaseForm({
      ...blankPurchase(),
      allocation: a.allocation || ''
    });
    setPurchaseBill(null);
  };

  const pickPurchaseBill = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true
      });
      if (!picked.canceled && picked.assets?.[0]) setPurchaseBill(picked.assets[0]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const savePurchase = async () => {
    if (!purchaseTarget) return;
    const qty = parseInt(String(purchaseForm.quantity || '').trim(), 10);
    if (!Number.isInteger(qty) || qty < 1) {
      return Alert.alert('Validation', 'Enter a valid quantity (1 or more).');
    }
    const price = Number(purchaseForm.purchase_price || 0);
    if (!Number.isFinite(price) || price < 0) {
      return Alert.alert('Validation', 'Enter a valid purchase price.');
    }
    setBusy(true);
    try {
      const token = await getToken();
      if (purchaseBill) {
        const fd = new FormData();
        fd.append('quantity', String(qty));
        fd.append('purchase_date', String(purchaseForm.purchase_date || todayIso()).trim());
        fd.append('purchase_price', String(price));
        fd.append('bill_no', String(purchaseForm.bill_no || '').trim());
        fd.append('vendor_name', String(purchaseForm.vendor_name || '').trim());
        fd.append('allocation', String(purchaseForm.allocation || '').trim());
        fd.append('specifications', String(purchaseForm.specifications || '').trim());
        fd.append('notes', String(purchaseForm.notes || '').trim());
        if (Platform.OS === 'web' && (purchaseBill as any).file) {
          fd.append('file', (purchaseBill as any).file);
        } else {
          fd.append('file', {
            uri: purchaseBill.uri,
            name: purchaseBill.name || 'bill',
            type: purchaseBill.mimeType || 'application/octet-stream'
          } as any);
        }
        const resp = await fetch(`${API_BASE}/api/assets/${purchaseTarget.id}/purchases`, {
          method: 'POST',
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          body: fd
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.message || 'Failed to add purchase');
      } else {
        await api(`/api/assets/${purchaseTarget.id}/purchases`, {
          method: 'POST',
          body: JSON.stringify({
            quantity: qty,
            purchase_date: String(purchaseForm.purchase_date || todayIso()).trim(),
            purchase_price: price,
            bill_no: String(purchaseForm.bill_no || '').trim(),
            vendor_name: String(purchaseForm.vendor_name || '').trim(),
            allocation: String(purchaseForm.allocation || '').trim(),
            specifications: String(purchaseForm.specifications || '').trim(),
            notes: String(purchaseForm.notes || '').trim()
          })
        });
      }
      setPurchaseTarget(null);
      setPurchaseBill(null);
      await load();
      Alert.alert('Saved', `Added +${qty} unit(s) to ${purchaseTarget.name}.`);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to add purchase');
    } finally {
      setBusy(false);
    }
  };

  const deletePurchaseBatch = async (asset: any, batch: any) => {
    const label = `${batch.quantity} nos (${batch.purchase_date ? String(batch.purchase_date).slice(0, 10) : 'batch'})`;
    if (Platform.OS === 'web') {
      if (!window.confirm(`Delete purchase batch ${label} from "${asset.name}"? Stock quantity will be reduced.`)) return;
    }
    try {
      await api(`/api/assets/${asset.id}/purchases/${batch.id}`, { method: 'DELETE' });
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to delete purchase record');
    }
  };

  const openEditModal = (a: any) => {
    const openingBatch = Array.isArray(a.purchases) ? a.purchases.find((p: any) => p.is_opening) : null;
    setEditTarget(a);
    setEditForm({
      name: a.name || '',
      category: a.category || '',
      allocation: a.allocation || '',
      custodian: a.custodian || '',
      specifications: a.specifications || '',
      opening_quantity: String(openingBatch ? openingBatch.quantity : (a.quantity ?? 1))
    });
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!String(editForm.name || '').trim()) {
      return Alert.alert('Validation', 'Asset Name is required.');
    }
    setBusy(true);
    try {
      await api(`/api/assets/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(editForm.name || '').trim(),
          category: String(editForm.category || '').trim(),
          allocation: String(editForm.allocation || '').trim(),
          custodian: String(editForm.custodian || '').trim(),
          specifications: String(editForm.specifications || '').trim(),
          opening_quantity: editForm.opening_quantity === '' ? undefined : parseInt(editForm.opening_quantity, 10)
        })
      });
      setEditTarget(null);
      await load();
      Alert.alert('Updated', 'Asset details updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update asset');
    } finally {
      setBusy(false);
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
    <View style={s.page}>
    <ScrollView ref={scrollRef} style={s.page} contentContainerStyle={s.content}>
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
          📋 Registered Assets ({filteredAssets.length} of {assets.length}  •  Total Qty: {filteredTotalQty} nos)
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

            {/* Purchase History Batches */}
            {Array.isArray(a.purchases) && a.purchases.length > 0 && (
              <View style={s.purchaseBox}>
                <Text style={s.purchaseBoxTitle}>
                  📦 Purchase History ({a.purchases.length} {a.purchases.length === 1 ? 'batch' : 'batches'})
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
                  <View style={{ minWidth: 740, flex: 1 }}>
                    <View style={s.purchaseHeadRow}>
                      <Text style={[s.pHeadCell, s.pColSl]}>Sl</Text>
                      <Text style={[s.pHeadCell, s.pColQty]}>Qty</Text>
                      <Text style={[s.pHeadCell, s.pColDate]}>Date</Text>
                      <Text style={[s.pHeadCell, s.pColPrice]}>Price</Text>
                      <Text style={[s.pHeadCell, s.pColBill]}>Bill No.</Text>
                      <Text style={[s.pHeadCell, s.pColVendor]}>Vendor</Text>
                      <Text style={[s.pHeadCell, s.pColLoc]}>Location</Text>
                      <Text style={[s.pHeadCell, s.pColAct]} />
                    </View>
                    {a.purchases.map((p: any, pIdx: number) => {
                      const dateTxt = p.purchase_date
                        ? String(p.purchase_date).slice(0, 10).split('-').reverse().join('-')
                        : p.is_opening
                          ? 'Opening Stock'
                          : '-';
                      const extraNotes = [p.specifications || null, p.notes && !p.is_opening ? p.notes : null]
                        .filter(Boolean)
                        .join(' • ');
                      return (
                        <View key={p.id} style={s.purchaseRow}>
                          <Text style={[s.pSlText, s.pColSl]}>{pIdx + 1}</Text>
                          <View style={s.pColQty}>
                            <View style={[s.batchQtyPill, p.is_opening && s.batchQtyOpening]}>
                              <Text style={[s.batchQtyText, p.is_opening && s.batchQtyOpeningText]}>
                                {`${p.quantity} nos`}
                              </Text>
                            </View>
                          </View>
                          <Text style={[s.batchDateText, s.pColDate]}>
                            {dateTxt}
                            {p.is_opening && p.purchase_date ? ' (Opening)' : ''}
                          </Text>
                          <Text style={[s.batchMetaText, s.pColPrice, { fontWeight: '700' }]}>
                            {Number(p.purchase_price || 0) > 0 ? `₹${Number(p.purchase_price).toLocaleString()}` : '—'}
                          </Text>
                          <Text style={[s.batchMetaText, s.pColBill]}>{p.bill_no || '—'}</Text>
                          <Text style={[s.batchMetaText, s.pColVendor]}>{p.vendor_name || '—'}</Text>
                          <View style={s.pColLoc}>
                            <Text style={[s.batchMetaText, { fontWeight: '700', color: '#0f172a' }]}>
                              {p.allocation || '—'}
                            </Text>
                            {extraNotes ? <Text style={s.batchSubNote}>{extraNotes}</Text> : null}
                          </View>
                          <View style={[s.purchaseRowRight, s.pColAct]}>
                            {p.bill_file_url && (
                              <TouchableOpacity
                                style={s.batchBillBtn}
                                onPress={() => {
                                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                    window.open(API_BASE + p.bill_file_url, '_blank');
                                  }
                                }}
                              >
                                <Text style={s.batchBillBtnText}>📎 Bill</Text>
                              </TouchableOpacity>
                            )}
                            {!p.is_opening && (
                              <TouchableOpacity
                                style={s.batchDelBtn}
                                onPress={() => deletePurchaseBatch(a, p)}
                              >
                                <Text style={s.batchDelBtnText}>✕</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

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
              {a.status !== 'Disposed' && (
                <TouchableOpacity style={s.btnAddPurchase} onPress={() => openPurchaseModal(a)}>
                  <Text style={s.actionBtnText}>➕ Add Purchase</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.btnEdit} onPress={() => openEditModal(a)}>
                <Text style={s.actionBtnText}>✏️ Edit</Text>
              </TouchableOpacity>
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
    </ScrollView>

    {/* Add Purchase Modal */}
    {purchaseTarget && (
      <View style={s.modalOverlay}>
        <ScrollView contentContainerStyle={s.modalScrollWrap} style={{ width: '100%' }}>
          <View style={s.modalCard}>
            <Text style={s.modalHeading}>➕ Add Purchase: {purchaseTarget.name}</Text>
            <View style={s.purchasePreviewBanner}>
              <Text style={s.purchasePreviewText}>
                ID #{purchaseTarget.asset_id}  •  Current Qty: {Number(purchaseTarget.quantity || 0)} nos  →  New Total:{' '}
                {Number(purchaseTarget.quantity || 0) + Math.max(0, parseInt(String(purchaseForm.quantity || '0'), 10) || 0)} nos
              </Text>
            </View>
            <Field
              placeholder="Quantity Purchased * (e.g. 3)"
              value={purchaseForm.quantity}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, quantity: v.replace(/[^0-9]/g, '') }))}
              keyboardType="numeric"
            />
            <Field
              placeholder="Purchase Date * (YYYY-MM-DD)"
              value={purchaseForm.purchase_date}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, purchase_date: v }))}
            />
            <Field
              placeholder="Total Purchase Price for this batch (₹)"
              value={purchaseForm.purchase_price}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, purchase_price: v }))}
              keyboardType="numeric"
            />
            <Field
              placeholder="Bill / Invoice Number"
              value={purchaseForm.bill_no}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, bill_no: v }))}
            />
            <Field
              placeholder="Vendor / Supplier Name"
              value={purchaseForm.vendor_name}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, vendor_name: v }))}
            />
            <Field
              placeholder="Allocation / Location (e.g. Computer Lab)"
              value={purchaseForm.allocation}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, allocation: v }))}
            />
            <Field
              placeholder="Model / Specifications / Notes (optional)"
              value={purchaseForm.specifications}
              onChangeText={(v: string) => setPurchaseForm((x: any) => ({ ...x, specifications: v }))}
            />

            {purchaseBill && (
              <View style={s.selectedInvoiceBadge}>
                <Text style={s.selectedInvoiceText}>📎 Attached Bill: {purchaseBill.name}</Text>
              </View>
            )}

            <View style={[s.modalActions, { flexWrap: 'wrap' }]}>
              <TouchableOpacity style={s.invoicePicker} onPress={pickPurchaseBill}>
                <Text style={s.white}>📎 Attach Bill</Text>
              </TouchableOpacity>
              <TouchableOpacity disabled={busy} style={s.submitBtn} onPress={savePurchase}>
                <Text style={s.white}>{busy ? 'Saving...' : '💾 Save Purchase'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.cancelBtn}
                onPress={() => {
                  setPurchaseTarget(null);
                  setPurchaseBill(null);
                }}
              >
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    )}

    {/* Edit Asset Modal */}
    {editTarget && (
      <View style={s.modalOverlay}>
        <ScrollView contentContainerStyle={s.modalScrollWrap} style={{ width: '100%' }}>
          <View style={s.modalCard}>
            <Text style={s.modalHeading}>✏️ Edit Asset: #{editTarget.asset_id}</Text>
            <Text style={s.modalSub}>Update asset info or Opening Stock quantity</Text>
            <Field
              placeholder="Asset Name *"
              value={editForm.name}
              onChangeText={(v: string) => setEditForm((x: any) => ({ ...x, name: v }))}
            />
            <Field
              placeholder="Category"
              value={editForm.category}
              onChangeText={(v: string) => setEditForm((x: any) => ({ ...x, category: v }))}
            />
            <Field
              placeholder="Opening Stock Quantity (e.g. 7)"
              value={editForm.opening_quantity}
              onChangeText={(v: string) => setEditForm((x: any) => ({ ...x, opening_quantity: v.replace(/[^0-9]/g, '') }))}
              keyboardType="numeric"
            />
            <Field
              placeholder="Allocation / Location"
              value={editForm.allocation}
              onChangeText={(v: string) => setEditForm((x: any) => ({ ...x, allocation: v }))}
            />
            <Field
              placeholder="Custodian / Caretaker"
              value={editForm.custodian}
              onChangeText={(v: string) => setEditForm((x: any) => ({ ...x, custodian: v }))}
            />
            <Field
              placeholder="Specifications / Model"
              value={editForm.specifications}
              onChangeText={(v: string) => setEditForm((x: any) => ({ ...x, specifications: v }))}
            />
            <View style={s.modalActions}>
              <TouchableOpacity disabled={busy} style={s.submitBtn} onPress={saveEdit}>
                <Text style={s.white}>{busy ? 'Saving...' : '💾 Save Changes'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditTarget(null)}>
                <Text style={s.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
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

    <ScrollNavigationButtons scrollRef={scrollRef} />
    </View>
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
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#93c5fd'
  },
  qtyBadgeText: { fontSize: 14.5, fontWeight: '900', color: '#1d4ed8' },
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
  btnAddPurchase: {
    backgroundColor: '#15803d',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  btnEdit: {
    backgroundColor: '#475569',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 6
  },
  purchaseBox: {
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  purchaseBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
    marginBottom: 8
  },
  purchaseHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 4,
    backgroundColor: '#dcfce7',
    borderRadius: 5,
    marginBottom: 2
  },
  pHeadCell: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    textTransform: 'uppercase'
  },
  pColSl: { width: 34, textAlign: 'center' },
  pColQty: { width: 88, alignItems: 'flex-start', paddingRight: 6 },
  pColDate: { width: 160, paddingRight: 8 },
  pColPrice: { width: 95, paddingRight: 8 },
  pColBill: { width: 85, paddingRight: 8 },
  pColVendor: { width: 120, paddingRight: 8 },
  pColLoc: { flex: 1, minWidth: 140, paddingRight: 8 },
  pColAct: { width: 82, justifyContent: 'flex-end' },
  pSlText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#166534'
  },
  purchaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#dcfce7'
  },
  purchaseRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  batchQtyPill: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6
  },
  batchQtyOpening: {
    backgroundColor: '#e2e8f0'
  },
  batchQtyText: {
    color: '#ffffff',
    fontSize: 14.5,
    fontWeight: '900'
  },
  batchQtyOpeningText: {
    color: '#0f172a'
  },
  batchDateText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  batchMetaText: {
    fontSize: 13,
    color: '#334155'
  },
  batchSubNote: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1
  },
  batchBillBtn: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5
  },
  batchBillBtnText: {
    color: '#0369a1',
    fontSize: 11,
    fontWeight: '700'
  },
  batchDelBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5
  },
  batchDelBtnText: {
    color: '#b91c1c',
    fontSize: 11,
    fontWeight: '800'
  },
  purchasePreviewBanner: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    padding: 9,
    marginBottom: 12
  },
  purchasePreviewText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065f46'
  },
  modalScrollWrap: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16
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
