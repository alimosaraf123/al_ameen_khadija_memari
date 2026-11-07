import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import AcademyHeader from '../components/AcademyHeader';
import DatePickerField from '../components/DatePickerField';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';
import { Select } from '../components/StudentDirectory';

type Mode = 'menu' | 'in' | 'out' | 'record';

interface StockRow {
  id: string;
  stock_id: string;
  item_name: string;
  quantity: string;
  unit: string;
  rate: string;
  note: string;
  available_balance: number;
}

const COMMON_UNITS = [
  { value: 'Bag', label: 'Bag' },
  { value: 'Kg', label: 'Kg' },
  { value: 'Gm', label: 'Gm' },
  { value: 'Litre', label: 'Litre' },
  { value: 'Packet', label: 'Packet' },
  { value: 'Piece', label: 'Piece' },
  { value: 'Quintal', label: 'Quintal' },
  { value: 'Tin', label: 'Tin' },
  { value: 'Crate', label: 'Crate' },
  { value: 'Box', label: 'Box' },
];

const today = () => {
  const d = new Date(),
    p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const cleanNumericInput = (val: string): string => {
  if (!val) return '';
  let cleaned = val.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned;
};

const createEmptyRow = (defaultUnit = 'Kg'): StockRow => ({
  id: 'r_' + Math.random().toString(36).substring(2, 9),
  stock_id: '',
  item_name: '',
  quantity: '',
  unit: defaultUnit,
  rate: '',
  note: '',
  available_balance: 0,
});

export default function Office() {
  const [stock, setStock] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [mode, setMode] = useState<Mode>('menu');
  const [adminView, setAdminView] = useState(false);

  // Modal State for "Create Stock Item"
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [item, setItem] = useState('');
  const [unit, setUnit] = useState('Kg');
  const [opening, setOpening] = useState('');
  const [reorder, setReorder] = useState('');
  const [creatingItem, setCreatingItem] = useState(false);

  // Modal State for "Edit Stock Item" (Admin Correction)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('Kg');
  const [editQty, setEditQty] = useState('');
  const [editReorder, setEditReorder] = useState('');
  const [updatingItem, setUpdatingItem] = useState(false);

  // Bulk Multi-row entry states
  const [date, setDate] = useState(today());
  const [dateFilterEnabled, setDateFilterEnabled] = useState(true);
  const [invoice, setInvoice] = useState('');
  const [supplier, setSupplier] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);

  // Initialize with 5 rows matching the user's template
  const [rows, setRows] = useState<StockRow[]>([
    createEmptyRow('Bag'),
    createEmptyRow('Kg'),
    createEmptyRow('Kg'),
    createEmptyRow('Kg'),
    createEmptyRow('Kg'),
  ]);

  const load = async () => {
    try {
      const [d, t] = await Promise.all([
        api('/api/service-panels/dining'),
        api('/api/service-panels/dining/transactions'),
      ]);
      setStock(d.stock || []);
      setTransactions(t.transactions || []);
    } catch (e: any) {
      Alert.alert('Dining', e.message);
    }
  };

  useEffect(() => {
    void getUser<any>().then((u) => setAdminView(['admin', 'super_admin'].includes(u?.role)));
    void load();
  }, []);

  const history = useMemo(() => {
    return transactions.filter((x) => {
      // 1. Transaction Type
      if (mode !== 'record' && x.transaction_type !== mode) return false;

      // 2. Filter by Item if selected
      if (filter && String(x.stock_id) !== filter) return false;

      // 3. Filter by the Date from the top form if enabled
      if (mode !== 'record' && dateFilterEnabled && date) {
        const txnDate = String(x.transaction_date || x.created_at || '').slice(0, 10);
        if (txnDate !== date.trim()) return false;
      }

      return true;
    });
  }, [transactions, mode, filter, date, dateFilterEnabled]);

  const open = (next: Mode) => {
    setFilter('');
    setDate(today());
    setDateFilterEnabled(true);
    setInvoice('');
    setSupplier('');
    // Reset to 5 empty rows
    setRows([
      createEmptyRow('Bag'),
      createEmptyRow('Kg'),
      createEmptyRow('Kg'),
      createEmptyRow('Kg'),
      createEmptyRow('Kg'),
    ]);
    setMode(next);
  };

  // Row Manipulation Handlers
  const addRow = () => {
    setRows((prev) => [...prev, createEmptyRow(mode === 'in' ? 'Bag' : 'Kg')]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateRow = (index: number, patch: Partial<StockRow>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        return { ...r, ...patch };
      })
    );
  };

  // Get available stock items for a given row index, excluding items selected in other rows
  const getAvailableStockForIndex = (currentIndex: number) => {
    const selectedOthers = new Set(
      rows
        .filter((_, idx) => idx !== currentIndex)
        .map((r) => r.item_name.trim().toLowerCase())
        .filter(Boolean)
    );
    return stock.filter(
      (st) => !selectedOthers.has(String(st.item_name || '').trim().toLowerCase())
    );
  };

  const handleItemNameChange = (index: number, text: string) => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();

    if (!trimmed) {
      updateRow(index, {
        item_name: '',
        stock_id: '',
        available_balance: 0,
      });
      return;
    }

    // Check if this item is already chosen in any other row
    const duplicateRowIndex = rows.findIndex(
      (r, i) => i !== index && r.item_name.trim().toLowerCase() === lower
    );

    const matched = stock.find((s) => s.item_name.toLowerCase() === lower);

    if (matched) {
      if (duplicateRowIndex !== -1) {
        Alert.alert(
          'Duplicate Item',
          `"${matched.item_name}" is already selected in Row ${duplicateRowIndex + 1}. An item cannot be added twice.`
        );
        updateRow(index, {
          item_name: '',
          stock_id: '',
          available_balance: 0,
        });
        return;
      }

      updateRow(index, {
        item_name: matched.item_name,
        stock_id: String(matched.id),
        unit: matched.unit || 'Kg',
        available_balance: Number(matched.current_quantity || 0),
      });
    } else {
      if (duplicateRowIndex !== -1 && trimmed.length >= 3) {
        Alert.alert(
          'Duplicate Item',
          `"${trimmed}" is already entered in Row ${duplicateRowIndex + 1}. An item cannot be added twice.`
        );
        updateRow(index, {
          item_name: '',
          stock_id: '',
          available_balance: 0,
        });
        return;
      }

      updateRow(index, {
        item_name: text,
        stock_id: '',
        available_balance: 0,
      });
    }
  };

  const handleItemBlur = (index: number) => {
    const row = rows[index];
    if (!row || !row.item_name.trim()) return;
    const lower = row.item_name.trim().toLowerCase();
    const duplicateRowIndex = rows.findIndex(
      (r, i) => i !== index && r.item_name.trim().toLowerCase() === lower
    );
    if (duplicateRowIndex !== -1) {
      Alert.alert(
        'Duplicate Item',
        `"${row.item_name.trim()}" is already entered in Row ${duplicateRowIndex + 1}. Duplicate items cannot be added.`
      );
      updateRow(index, {
        item_name: '',
        stock_id: '',
        available_balance: 0,
      });
    }
  };

  const handleItemSelect = (index: number, stockId: string) => {
    if (!stockId) {
      updateRow(index, {
        stock_id: '',
        item_name: '',
        available_balance: 0,
      });
      return;
    }
    const matched = stock.find((s) => String(s.id) === stockId);
    if (matched) {
      const duplicateRowIndex = rows.findIndex(
        (r, i) =>
          i !== index &&
          (r.stock_id === stockId ||
            r.item_name.trim().toLowerCase() === matched.item_name.trim().toLowerCase())
      );
      if (duplicateRowIndex !== -1) {
        Alert.alert(
          'Duplicate Item',
          `"${matched.item_name}" is already selected in Row ${duplicateRowIndex + 1}. An item cannot be added twice.`
        );
        updateRow(index, {
          stock_id: '',
          item_name: '',
          available_balance: 0,
        });
        return;
      }

      updateRow(index, {
        stock_id: String(matched.id),
        item_name: matched.item_name,
        unit: matched.unit || 'Kg',
        available_balance: Number(matched.current_quantity || 0),
      });
    }
  };

  // Save all entered rows in batch
  const saveBatch = async () => {
    const validRows = rows.filter(
      (r) => (r.stock_id || r.item_name.trim()) && Number(r.quantity) > 0
    );

    if (validRows.length === 0) {
      Alert.alert(
        'Validation Error',
        'Please enter at least one item name and a positive quantity.'
      );
      return;
    }

    // Validate uniqueness of items in the batch
    const seenItemNames = new Set<string>();
    const seenStockIds = new Set<string>();
    for (const r of validRows) {
      const nameKey = r.item_name.trim().toLowerCase();
      const idKey = r.stock_id ? String(r.stock_id).trim() : '';
      if (seenItemNames.has(nameKey) || (idKey && seenStockIds.has(idKey))) {
        Alert.alert(
          'Duplicate Item',
          `"${r.item_name.trim()}" is entered more than once. Each item can only be entered once in Stock ${mode === 'in' ? 'In' : 'Out'}. Please combine quantities or remove duplicates.`
        );
        return;
      }
      seenItemNames.add(nameKey);
      if (idKey) seenStockIds.add(idKey);
    }

    if (mode === 'out') {
      for (const r of validRows) {
        if (Number(r.quantity) > Number(r.available_balance || 0)) {
          Alert.alert(
            'Insufficient Stock',
            `Quantity Out for "${r.item_name}" exceeds available balance of ${r.available_balance} ${r.unit}.`
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payload = {
        transaction_type: mode,
        transaction_date: date,
        invoice_no: invoice.trim() || null,
        supplier_name: supplier.trim() || null,
        items: validRows.map((r) => ({
          stock_id: r.stock_id ? Number(r.stock_id) : null,
          item_name: r.item_name.trim(),
          unit: r.unit || 'Kg',
          quantity: Number(r.quantity),
          rate: r.rate.trim() ? Number(r.rate) : null,
          note: r.note.trim() || null,
        })),
      };

      await api('/api/service-panels/dining/transactions-batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      Alert.alert(
        'Success',
        mode === 'in'
          ? `Stock In saved successfully! (${validRows.length} items)`
          : `Stock Out saved successfully! (${validRows.length} items)`
      );

      // Reset rows to 5 clean rows
      setRows([
        createEmptyRow('Bag'),
        createEmptyRow('Kg'),
        createEmptyRow('Kg'),
        createEmptyRow('Kg'),
        createEmptyRow('Kg'),
      ]);
      setInvoice('');
      setSupplier('');
      await load();
    } catch (e: any) {
      Alert.alert('Save Failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  // Add individual stock item via Modal or Record tab
  const handleCreateItem = async () => {
    if (!item.trim()) return Alert.alert('Dining', 'Please enter item name.');
    setCreatingItem(true);
    try {
      await api('/api/service-panels/dining/items', {
        method: 'POST',
        body: JSON.stringify({
          item_name: item.trim(),
          unit: unit.trim() || 'Kg',
          current_quantity: Number(opening) || 0,
          reorder_level: Number(reorder) || 0,
        }),
      });
      const addedName = item.trim();
      setItem('');
      setOpening('');
      setReorder('');
      setShowCreateModal(false);
      await load();
      Alert.alert('Success', `Stock item "${addedName}" added successfully.`);
    } catch (e: any) {
      Alert.alert('Create Item Failed', e.message);
    } finally {
      setCreatingItem(false);
    }
  };

  const addItem = handleCreateItem;

  // Edit / Correct Stock Item Handlers
  const startEditItem = (itemObj: any) => {
    if (!itemObj) return;
    setEditingItem(itemObj);
    setEditName(itemObj.item_name || '');
    setEditUnit(itemObj.unit || 'Kg');
    setEditQty(
      itemObj.current_quantity !== undefined && itemObj.current_quantity !== null
        ? String(itemObj.current_quantity)
        : '0'
    );
    setEditReorder(
      itemObj.reorder_level !== undefined && itemObj.reorder_level !== null
        ? String(itemObj.reorder_level)
        : '0'
    );
    setShowEditModal(true);
  };

  const handleUpdateItem = async () => {
    if (!editingItem) return;
    if (!editName.trim()) {
      Alert.alert('Validation Error', 'Item name cannot be empty.');
      return;
    }
    setUpdatingItem(true);
    try {
      await api(`/api/service-panels/dining/items/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          item_name: editName.trim(),
          unit: editUnit.trim() || 'Kg',
          current_quantity: editQty !== '' ? Number(editQty) : undefined,
          reorder_level: editReorder !== '' ? Number(editReorder) : undefined,
        }),
      });
      Alert.alert('Success', `Item "${editName.trim()}" updated successfully!`);
      setShowEditModal(false);
      setEditingItem(null);
      await load();
    } catch (e: any) {
      Alert.alert('Update Failed', e.message);
    } finally {
      setUpdatingItem(false);
    }
  };

  return (
    <SafeAreaView style={s.page}>
      <ScrollView contentContainerStyle={s.body}>
        <AcademyHeader />

        {mode === 'menu' ? (
          <View style={s.dialog}>
            <View style={s.dialogHead}>
              <Text style={s.dialogTitle}>Dining</Text>
            </View>
            <View style={s.menuGrid}>
              <Menu title="Stock In" onPress={() => open('in')} />
              <Menu title="Stock Out" onPress={() => open('out')} />
              <Menu title="Stock Record" onPress={() => open('record')} />
              <Menu
                title="Create Stock Item"
                onPress={() => {
                  setItem('');
                  setOpening('');
                  setReorder('');
                  setShowCreateModal(true);
                }}
              />
              <Menu
                title="Edit Stock Items"
                onPress={() => {
                  if (stock.length > 0) {
                    startEditItem(stock[0]);
                  } else {
                    setShowEditModal(true);
                  }
                }}
              />
            </View>
          </View>
        ) : (
          <>
            <View style={s.pageNav}>
              <TouchableOpacity onPress={() => setMode('menu')} style={s.back}>
                <Text style={s.backText}>‹ Dining Menu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setItem('');
                  setOpening('');
                  setReorder('');
                  setShowCreateModal(true);
                }}
                style={s.createItemTopBtn}
              >
                <Text style={s.createItemTopBtnText}>⊕ Create Stock Item</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  if (stock.length > 0) {
                    startEditItem(stock[0]);
                  } else {
                    setShowEditModal(true);
                  }
                }}
                style={s.editItemTopBtn}
              >
                <Text style={s.editItemTopBtnText}>✏️ Edit Stock Items</Text>
              </TouchableOpacity>
            </View>

            {mode !== 'record' && (
              <View style={s.bulkCardWrapper}>
                {/* Top Row: Date & Header Badge */}
                <View style={s.bulkTopBar}>
                  <View style={s.dateGroup}>
                    <Text style={s.dateLabel}>Date:</Text>
                    <View style={s.dateInputWrap}>
                      <TextInput
                        value={date}
                        onChangeText={setDate}
                        placeholder="YYYY-MM-DD"
                        style={s.dateTextInput}
                      />
                    </View>
                  </View>

                  {/* Centered Title Badge */}
                  <View style={[s.badgeTag, mode === 'out' ? s.badgeOut : s.badgeIn]}>
                    <Text style={s.badgeTagText}>
                      {mode === 'out' ? '⊖ Stock Out Entry' : '⊕ Stock In Entry'}
                    </Text>
                  </View>

                  {/* Optional Invoice & Supplier fields for Stock In */}
                  {mode === 'in' ? (
                    <View style={s.inHeaderExtras}>
                      <View style={s.extraField}>
                        <Text style={s.extraLabel}>Invoice:</Text>
                        <TextInput
                          value={invoice}
                          onChangeText={setInvoice}
                          placeholder="Invoice No"
                          style={s.extraInput}
                        />
                      </View>
                      <View style={s.extraField}>
                        <Text style={s.extraLabel}>Supplier:</Text>
                        <TextInput
                          value={supplier}
                          onChangeText={setSupplier}
                          placeholder="Supplier Name"
                          style={s.extraInput}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ width: 140 }} />
                  )}
                </View>

                {/* Form Container with Warm Salmon/Peach Theme Matching Screenshot */}
                <View style={s.bulkFormContainer}>
                  {/* Datalists for autocomplete on web (each row gets available items excluding other rows) */}
                  {Platform.OS === 'web' && (
                    <>
                      {rows.map((_, i) => (
                        <datalist key={`dl-${i}`} id={`stock-items-datalist-${i}`}>
                          {getAvailableStockForIndex(i).map((st) => (
                            <option
                              key={st.id}
                              value={st.item_name}
                              label={`${st.item_name} (${mode === 'out' ? `Bal: ${st.current_quantity}` : `Stock: ${st.current_quantity}`} ${st.unit})`}
                            />
                          ))}
                        </datalist>
                      ))}
                    </>
                  )}

                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={s.rowsTable}>
                      {rows.map((row, index) => {
                        const totalAmount =
                          Number(row.quantity) > 0 && Number(row.rate) > 0
                            ? (Number(row.quantity) * Number(row.rate)).toFixed(2)
                            : '';

                        const isOverLimit =
                          mode === 'out' &&
                          Number(row.quantity) > 0 &&
                          Number(row.quantity) > Number(row.available_balance || 0);

                        const isDuplicateRow = rows.some(
                          (r, i) =>
                            i !== index &&
                            r.item_name.trim() !== '' &&
                            r.item_name.trim().toLowerCase() === row.item_name.trim().toLowerCase()
                        );

                        return (
                          <View key={row.id} style={s.rowItemLine}>
                            {/* 1. Item Name Column */}
                            <View style={s.cellItemName}>
                              <Text style={s.rowLabel}>Item Name:</Text>
                              {Platform.OS === 'web' ? (
                                <View style={s.inputWithDatalist}>
                                  <input
                                    list={`stock-items-datalist-${index}`}
                                    value={row.item_name}
                                    onChange={(e: any) =>
                                      handleItemNameChange(index, e.target.value)
                                    }
                                    onBlur={() => handleItemBlur(index)}
                                    placeholder="Item Name"
                                    style={{
                                      width: 175,
                                      height: 36,
                                      border: isDuplicateRow ? '1.5px solid #dc3545' : '1px solid #ced4da',
                                      borderRadius: 4,
                                      padding: '6px 10px',
                                      fontSize: 14,
                                      backgroundColor: '#fff',
                                      outline: 'none',
                                      color: '#212529',
                                    }}
                                  />
                                  {isDuplicateRow && (
                                    <span style={{ color: '#dc3545', fontSize: 11, fontWeight: 600, display: 'block', marginTop: 2 }}>
                                      ⚠️ Duplicate item
                                    </span>
                                  )}
                                </View>
                              ) : (
                                <View>
                                  <TextInput
                                    value={row.item_name}
                                    onChangeText={(txt) => handleItemNameChange(index, txt)}
                                    onBlur={() => handleItemBlur(index)}
                                    placeholder="Item Name"
                                    style={[
                                      s.cellTextInputItem,
                                      isDuplicateRow && { borderColor: '#dc3545', borderWidth: 1.5 },
                                    ]}
                                  />
                                  {isDuplicateRow && (
                                    <Text style={{ color: '#dc3545', fontSize: 11, fontWeight: '600', marginTop: 2 }}>
                                      ⚠️ Duplicate item
                                    </Text>
                                  )}
                                </View>
                              )}
                            </View>

                            {/* 2. Quantity Column */}
                            <View style={s.cellQuantity}>
                              <Text style={s.rowLabel}>Quantity:</Text>
                              {Platform.OS === 'web' ? (
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={row.quantity}
                                  onChange={(e: any) => {
                                    const cleaned = cleanNumericInput(e.target.value);
                                    e.target.value = cleaned;
                                    updateRow(index, { quantity: cleaned });
                                  }}
                                  onKeyDown={(e: any) => {
                                    if (
                                      e.key === 'Backspace' ||
                                      e.key === 'Tab' ||
                                      e.key === 'Delete' ||
                                      e.key === 'ArrowLeft' ||
                                      e.key === 'ArrowRight' ||
                                      e.key === 'Enter' ||
                                      e.ctrlKey ||
                                      e.metaKey
                                    ) {
                                      return;
                                    }
                                    if (/^[0-9]$/.test(e.key)) return;
                                    if (e.key === '.' && !row.quantity.includes('.')) return;
                                    e.preventDefault();
                                  }}
                                  placeholder="Quanti"
                                  style={{
                                    width: 78,
                                    height: 36,
                                    border: isOverLimit ? '1.5px solid #dc3545' : '1px solid #ced4da',
                                    borderRadius: 4,
                                    padding: '6px 8px',
                                    fontSize: 14,
                                    backgroundColor: '#fff',
                                    outline: 'none',
                                    color: '#212529',
                                  }}
                                />
                              ) : (
                                <TextInput
                                  value={row.quantity}
                                  onChangeText={(val) => updateRow(index, { quantity: cleanNumericInput(val) })}
                                  placeholder="Quanti"
                                  keyboardType="decimal-pad"
                                  style={[s.cellTextInputQty, isOverLimit && s.cellInputError]}
                                />
                              )}
                            </View>

                            {/* 3. Unit Column */}
                            <View style={s.cellUnit}>
                              <Text style={s.rowLabel}>Unit:</Text>
                              {Platform.OS === 'web' ? (
                                <select
                                  value={row.unit}
                                  onChange={(e: any) =>
                                    updateRow(index, { unit: e.target.value })
                                  }
                                  style={{
                                    width: 105,
                                    height: 36,
                                    border: '1px solid #ced4da',
                                    borderRadius: 4,
                                    padding: '6px 8px',
                                    fontSize: 14,
                                    backgroundColor: '#fff',
                                    outline: 'none',
                                    color: '#212529',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <option value="">Select Unit</option>
                                  {COMMON_UNITS.map((u) => (
                                    <option key={u.value} value={u.value}>
                                      {u.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <Select
                                  label=""
                                  value={row.unit}
                                  onChange={(u) => updateRow(index, { unit: u })}
                                  options={COMMON_UNITS}
                                  style={{ width: 100, height: 36 }}
                                />
                              )}
                            </View>

                            {/* 4. Fourth Column: Available Balance (Stock Out) OR Rate (Stock In) */}
                            {mode === 'out' ? (
                              <View style={s.cellBalance}>
                                <View style={s.balanceGreenBadge}>
                                  <Text style={s.balanceBadgeText}>Available Balance</Text>
                                </View>
                                <View style={s.balanceValueBox}>
                                  <Text style={s.balanceValueText}>
                                    {row.available_balance !== undefined
                                      ? fmt(row.available_balance)
                                      : '0.00'}
                                  </Text>
                                </View>
                              </View>
                            ) : (
                              <View style={s.cellRate}>
                                <Text style={s.rowLabel}>Rate:</Text>
                                {Platform.OS === 'web' ? (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={row.rate}
                                    onChange={(e: any) => {
                                      const cleaned = cleanNumericInput(e.target.value);
                                      e.target.value = cleaned;
                                      updateRow(index, { rate: cleaned });
                                    }}
                                    onKeyDown={(e: any) => {
                                      if (
                                        e.key === 'Backspace' ||
                                        e.key === 'Tab' ||
                                        e.key === 'Delete' ||
                                        e.key === 'ArrowLeft' ||
                                        e.key === 'ArrowRight' ||
                                        e.key === 'Enter' ||
                                        e.ctrlKey ||
                                        e.metaKey
                                      ) {
                                        return;
                                      }
                                      if (/^[0-9]$/.test(e.key)) return;
                                      if (e.key === '.' && !row.rate.includes('.')) return;
                                      e.preventDefault();
                                    }}
                                    placeholder="Rate"
                                    style={{
                                      width: 70,
                                      height: 36,
                                      border: '1px solid #ced4da',
                                      borderRadius: 4,
                                      padding: '6px 8px',
                                      fontSize: 14,
                                      backgroundColor: '#fff',
                                      outline: 'none',
                                      color: '#212529',
                                    }}
                                  />
                                ) : (
                                  <TextInput
                                    value={row.rate}
                                    onChangeText={(val) => updateRow(index, { rate: cleanNumericInput(val) })}
                                    placeholder="Rate"
                                    keyboardType="decimal-pad"
                                    style={s.cellTextInputRate}
                                  />
                                )}
                                <View style={s.rateTotalBox}>
                                  <Text style={s.rateTotalText}>
                                    {totalAmount ? `₹ ${totalAmount}` : ''}
                                  </Text>
                                </View>
                              </View>
                            )}

                            {/* 5. Description Column */}
                            <View style={s.cellDescription}>
                              <Text style={s.rowLabel}>Description:</Text>
                              <TextInput
                                value={row.note}
                                onChangeText={(val) => updateRow(index, { note: val })}
                                placeholder="Enter Short Description of Item"
                                style={s.cellTextInputDesc}
                              />
                            </View>

                            {/* 6. Action Column (+Add / Remove) */}
                            <View style={s.cellActions}>
                              {index === 0 ? (
                                <TouchableOpacity onPress={addRow} style={s.actionBtnText}>
                                  <Text style={s.addText}>+Add</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  onPress={() => removeRow(index)}
                                  style={s.actionBtnText}
                                >
                                  <Text style={s.removeText}>Remove</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>

                  {/* Save Button in Bottom Right */}
                  <View style={s.saveBar}>
                    {rows.length > 1 && (
                      <TouchableOpacity onPress={addRow} style={s.addMoreBtn}>
                        <Text style={s.addMoreBtnText}>+ Add More Row</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={saveBatch}
                      disabled={saving}
                      style={[s.saveButton, saving && s.saveButtonDisabled]}
                    >
                      <Text style={s.saveButtonIcon}>💾</Text>
                      <Text style={s.saveButtonText}>{saving ? 'Saving...' : 'Save'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {/* Filter and Transactions History Table */}
            {mode !== 'record' ? (
              <>
                <Panel title="▼ Filter Transactions" out={mode === 'out'}>
                  <View style={{ maxWidth: 900, flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}>
                    <View style={{ minWidth: 260, flex: 1 }}>
                      <Labeled label="Filter by Item">
                        <Select
                          label=""
                          value={filter}
                          onChange={setFilter}
                          options={[
                            { value: '', label: 'All Items' },
                            ...stock.map((x) => ({
                              value: String(x.id),
                              label: x.item_name,
                            })),
                          ]}
                        />
                      </Labeled>
                    </View>

                    <View style={{ minWidth: 260, gap: 6 }}>
                      <Text style={s.label}>Date Filter:</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => setDateFilterEnabled(!dateFilterEnabled)}
                          style={[
                            s.dateFilterBtn,
                            dateFilterEnabled ? s.dateFilterBtnActive : s.dateFilterBtnInactive,
                          ]}
                        >
                          <Text
                            style={
                              dateFilterEnabled
                                ? s.dateFilterBtnActiveText
                                : s.dateFilterBtnInactiveText
                            }
                          >
                            {dateFilterEnabled ? `📅 Date: ${date}` : '🌐 All Dates'}
                          </Text>
                        </TouchableOpacity>

                        {dateFilterEnabled ? (
                          <TouchableOpacity
                            onPress={() => setDateFilterEnabled(false)}
                            style={s.clearDateFilterBtn}
                          >
                            <Text style={s.clearDateFilterBtnText}>Show All Dates</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            onPress={() => setDateFilterEnabled(true)}
                            style={s.clearDateFilterBtn}
                          >
                            <Text style={s.clearDateFilterBtnText}>Filter Above Date ({date})</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  </View>
                </Panel>
                <Panel
                  title={
                    mode === 'out'
                      ? `☷ Stock Out Transactions ${dateFilterEnabled && date ? `(${date})` : '(All Dates)'}`
                      : `☷ Stock In Transactions ${dateFilterEnabled && date ? `(${date})` : '(All Dates)'}`
                  }
                  out={mode === 'out'}
                >
                  <TransactionTable rows={history} type={mode} />
                </Panel>
              </>
            ) : (
              <RecordPanel
                stock={stock}
                transactions={transactions}
                item={item}
                setItem={setItem}
                unit={unit}
                setUnit={setUnit}
                opening={opening}
                setOpening={setOpening}
                reorder={reorder}
                setReorder={setReorder}
                add={addItem}
                onEdit={startEditItem}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Create Stock Item Popup Modal */}
      {showCreateModal && (
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>⊕ Create Stock Item</Text>
              <TouchableOpacity
                onPress={() => setShowCreateModal(false)}
                style={s.modalCloseBtn}
              >
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={s.modalBody}>
              <View style={s.modalField}>
                <Text style={s.modalLabel}>Item Name *</Text>
                <TextInput
                  value={item}
                  onChangeText={setItem}
                  placeholder="Enter item name (e.g. Potato, Mustard Oil, Paneer)"
                  style={s.modalInput}
                  autoFocus
                />
              </View>

              <View style={s.modalField}>
                <Text style={s.modalLabel}>Unit *</Text>
                <UnitInput value={unit} set={setUnit} />
              </View>

              <View style={s.modalRow}>
                <View style={[s.modalField, { flex: 1 }]}>
                  <Text style={s.modalLabel}>Opening Quantity</Text>
                  <TextInput
                    value={opening}
                    onChangeText={(val) => setOpening(cleanNumericInput(val))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    style={s.modalInput}
                  />
                </View>
                <View style={[s.modalField, { flex: 1 }]}>
                  <Text style={s.modalLabel}>Reorder Level</Text>
                  <TextInput
                    value={reorder}
                    onChangeText={(val) => setReorder(cleanNumericInput(val))}
                    placeholder="0"
                    keyboardType="decimal-pad"
                    style={s.modalInput}
                  />
                </View>
              </View>

              <View style={s.modalFooter}>
                <TouchableOpacity
                  onPress={() => setShowCreateModal(false)}
                  style={s.modalCancelBtn}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCreateItem}
                  disabled={creatingItem}
                  style={[s.modalSaveBtn, creatingItem && s.saveButtonDisabled]}
                >
                  <Text style={s.modalSaveText}>
                    {creatingItem ? 'Adding...' : 'Add Item'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Edit / Correct Stock Item Modal (Admin Correction) */}
      {showEditModal && (
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={[s.modalHead, { backgroundColor: '#e67e22' }]}>
              <Text style={s.modalTitle}>✏️ Edit Stock Item (Admin Correction)</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                style={s.modalCloseBtn}
              >
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={s.modalBody}>
              {/* Dropdown to switch item easily */}
              <View style={s.modalField}>
                <Text style={s.modalLabel}>Select Item to Edit:</Text>
                {Platform.OS === 'web' ? (
                  <select
                    value={editingItem ? String(editingItem.id) : ''}
                    onChange={(e: any) => {
                      const sel = stock.find((x) => String(x.id) === e.target.value);
                      if (sel) startEditItem(sel);
                    }}
                    style={{
                      height: 38,
                      border: '1px solid #ced4da',
                      borderRadius: 6,
                      padding: '6px 10px',
                      fontSize: 14,
                      backgroundColor: '#fff',
                      color: '#212529',
                      outline: 'none',
                    }}
                  >
                    <option value="">-- Choose Stock Item --</option>
                    {stock.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.item_name} ({s.current_quantity} {s.unit})
                      </option>
                    ))}
                  </select>
                ) : (
                  <Select
                    label=""
                    value={editingItem ? String(editingItem.id) : ''}
                    onChange={(id) => {
                      const sel = stock.find((x) => String(x.id) === id);
                      if (sel) startEditItem(sel);
                    }}
                    options={[
                      { value: '', label: '-- Choose Stock Item --' },
                      ...stock.map((s) => ({
                        value: String(s.id),
                        label: `${s.item_name} (${s.current_quantity} ${s.unit})`,
                      })),
                    ]}
                  />
                )}
              </View>

              {editingItem && (
                <>
                  <View style={s.modalField}>
                    <Text style={s.modalLabel}>Item Name * (Spelling Correction):</Text>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="e.g. Beef"
                      style={s.modalInput}
                    />
                  </View>

                  <View style={s.modalField}>
                    <Text style={s.modalLabel}>Unit *:</Text>
                    <UnitInput value={editUnit} set={setEditUnit} />
                  </View>

                  <View style={s.modalRow}>
                    <View style={[s.modalField, { flex: 1 }]}>
                      <Text style={s.modalLabel}>Current Stock Quantity:</Text>
                      <TextInput
                        value={editQty}
                        onChangeText={(val) => setEditQty(cleanNumericInput(val))}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        style={s.modalInput}
                      />
                    </View>
                    <View style={[s.modalField, { flex: 1 }]}>
                      <Text style={s.modalLabel}>Reorder Level:</Text>
                      <TextInput
                        value={editReorder}
                        onChangeText={(val) => setEditReorder(cleanNumericInput(val))}
                        placeholder="0.00"
                        keyboardType="decimal-pad"
                        style={s.modalInput}
                      />
                    </View>
                  </View>
                </>
              )}

              <View style={s.modalFooter}>
                <TouchableOpacity
                  onPress={() => {
                    setShowEditModal(false);
                    setEditingItem(null);
                  }}
                  style={s.modalCancelBtn}
                >
                  <Text style={s.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleUpdateItem}
                  disabled={updatingItem || !editingItem}
                  style={[
                    s.modalSaveBtn,
                    { backgroundColor: '#e67e22' },
                    (updatingItem || !editingItem) && s.saveButtonDisabled,
                  ]}
                >
                  <Text style={s.modalSaveText}>
                    {updatingItem ? 'Updating...' : 'Save Changes'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const Panel = ({ title, out, children }: any) => (
  <View style={s.panel}>
    <View style={[s.panelHead, out && s.panelHeadOut]}>
      <Text style={s.panelTitle}>{title}</Text>
    </View>
    <View style={s.panelBody}>{children}</View>
  </View>
);

const Menu = ({ title, onPress }: any) => (
  <TouchableOpacity style={s.menu} onPress={onPress}>
    <Text style={s.arrow}>›</Text>
    <Text style={s.menuText}>{title}</Text>
  </TouchableOpacity>
);

const Labeled = ({ label, children, wide }: any) => (
  <View style={[s.fieldBox, wide && s.wide]}>
    <Text style={s.label}>{label}</Text>
    {children}
  </View>
);

const Field = ({ p, v, set, ...rest }: any) => (
  <TextInput value={v} onChangeText={set} placeholder={p} style={s.input} {...rest} />
);

const UnitInput = ({ value, set }: any) => (
  <View style={{ gap: 7 }}>
    <Select
      label="Select Unit"
      value={
        ['kg', 'gm', 'lit', 'pkt', 'pcs', 'bag'].includes(String(value).toLowerCase())
          ? String(value).toLowerCase()
          : ''
      }
      onChange={set}
      options={[
        { value: '', label: 'Select / Manual Unit' },
        { value: 'bag', label: 'bag' },
        { value: 'kg', label: 'kg' },
        { value: 'gm', label: 'gm' },
        { value: 'lit', label: 'lit' },
        { value: 'pkt', label: 'pkt' },
        { value: 'pcs', label: 'pcs' },
      ]}
    />
    <Field p="Or type unit manually" v={value} set={set} />
  </View>
);

const fmt = (x: any) => (x == null ? '-' : Number(x).toFixed(2));
const dateFmt = (x: any) =>
  x
    ? new Date(String(x).slice(0, 10) + 'T00:00:00').toLocaleDateString('en-GB')
    : '-';

const StockBalance = ({ stock, onEdit }: any) => {
  const [filterMode, setFilterMode] = useState<'all' | 'in_stock' | 'zero'>('all');
  const [search, setSearch] = useState('');

  const inStockCount = stock.filter((x: any) => Number(x.current_quantity) > 0).length;
  const zeroCount = stock.filter((x: any) => Number(x.current_quantity) <= 0).length;

  const filtered = stock.filter((x: any) => {
    if (filterMode === 'in_stock' && Number(x.current_quantity) <= 0) return false;
    if (filterMode === 'zero' && Number(x.current_quantity) > 0) return false;
    if (search && !x.item_name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <View style={{ gap: 12 }}>
      {/* Top Filter Tabs and Search */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity
            onPress={() => setFilterMode('all')}
            style={[s.stockFilterTab, filterMode === 'all' && s.stockFilterTabActive]}
          >
            <Text
              style={[
                s.stockFilterTabText,
                filterMode === 'all' && s.stockFilterTabTextActive,
              ]}
            >
              All Items ({stock.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterMode('in_stock')}
            style={[
              s.stockFilterTab,
              filterMode === 'in_stock' && s.stockFilterTabActive,
            ]}
          >
            <Text
              style={[
                s.stockFilterTabText,
                filterMode === 'in_stock' && s.stockFilterTabTextActive,
              ]}
            >
              In Stock &gt; 0 ({inStockCount})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setFilterMode('zero')}
            style={[s.stockFilterTab, filterMode === 'zero' && s.stockFilterTabActive]}
          >
            <Text
              style={[
                s.stockFilterTabText,
                filterMode === 'zero' && s.stockFilterTabTextActive,
              ]}
            >
              Out of Stock = 0 ({zeroCount})
            </Text>
          </TouchableOpacity>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="🔍 Search item name..."
          style={s.stockSearchInput}
        />
      </View>

      {/* Items List */}
      <View
        style={{
          borderRadius: 8,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#dee2e6',
        }}
      >
        {filtered.length ? (
          filtered.map((x: any) => {
            const qty = Number(x.current_quantity);
            const reorder = Number(x.reorder_level);
            const isZero = qty <= 0;
            const isLow = reorder > 0 && qty <= reorder;

            return (
              <View
                key={x.id}
                style={[
                  s.balanceRow,
                  isZero ? s.zeroRow : isLow ? s.low : s.inStockRow,
                ]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={s.bold}>{x.item_name}</Text>
                    {isZero ? (
                      <View style={s.zeroBadge}>
                        <Text style={s.zeroBadgeText}>Out of Stock</Text>
                      </View>
                    ) : (
                      <View style={s.inStockBadge}>
                        <Text style={s.inStockBadgeText}>In Stock</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ color: '#495057', fontSize: 13 }}>
                    Available Balance:{' '}
                    <Text
                      style={{
                        fontWeight: '800',
                        color: isZero ? '#6c757d' : '#198754',
                      }}
                    >
                      {fmt(x.current_quantity)} {x.unit}
                    </Text>
                    {reorder > 0 ? ` • Reorder Level: ${fmt(x.reorder_level)}` : ''}
                  </Text>
                </View>

                <TouchableOpacity
                  onPress={() => onEdit && onEdit(x)}
                  style={s.editRowBtn}
                >
                  <Text style={s.editRowBtnText}>✏️ Edit</Text>
                </TouchableOpacity>
              </View>
            );
          })
        ) : (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: '#6c757d', fontSize: 15 }}>
              No items matching the filter.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const RecordPanel = ({
  stock,
  transactions,
  item,
  setItem,
  unit,
  setUnit,
  opening,
  setOpening,
  reorder,
  setReorder,
  add,
  onEdit,
}: any) => {
  const [tab, setTab] = useState('current');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ledgerItem, setLedgerItem] = useState('');

  // Item Wise Report states
  const [itemFrom, setItemFrom] = useState('');
  const [itemTo, setItemTo] = useState('');
  const [appliedItemFrom, setAppliedItemFrom] = useState('');
  const [appliedItemTo, setAppliedItemTo] = useState('');
  const [itemSearch, setItemSearch] = useState('');

  const isItemReportActive = Boolean(appliedItemFrom || appliedItemTo);

  const handleGenerateItemReport = () => {
    if (!itemFrom && !itemTo) {
      Alert.alert('Date Required', 'Please choose From Date and/or To Date to generate report.');
      return;
    }
    setAppliedItemFrom(itemFrom);
    setAppliedItemTo(itemTo);
  };

  const handleResetItemReport = () => {
    setItemFrom('');
    setItemTo('');
    setAppliedItemFrom('');
    setAppliedItemTo('');
    setItemSearch('');
  };

  // 1. "item wise report e date na dele page faka thakbe"
  // 2. "0 item er kono record asbe na"
  // 3. "item wise report e item deye search option thakbe"
  const itemSummary = useMemo(() => {
    if (!isItemReportActive) return [];

    const periodTxns = transactions.filter((x: any) => {
      const d = String(x.transaction_date || x.created_at || '').slice(0, 10);
      return (!appliedItemFrom || d >= appliedItemFrom) && (!appliedItemTo || d <= appliedItemTo);
    });

    return stock
      .map((st: any) => {
        const rows = periodTxns.filter((x: any) => String(x.stock_id) === String(st.id));
        const stockIn = rows
          .filter((x: any) => x.transaction_type === 'in')
          .reduce((a: number, x: any) => a + Number(x.quantity), 0);
        const stockOut = rows
          .filter((x: any) => x.transaction_type === 'out')
          .reduce((a: number, x: any) => a + Number(x.quantity), 0);
        return {
          ...st,
          stockIn,
          stockOut,
        };
      })
      .filter((x: any) => Number(x.stockIn) > 0 || Number(x.stockOut) > 0)
      .filter((x: any) => {
        if (itemSearch.trim() && !x.item_name.toLowerCase().includes(itemSearch.trim().toLowerCase())) {
          return false;
        }
        return true;
      });
  }, [stock, transactions, appliedItemFrom, appliedItemTo, isItemReportActive, itemSearch]);

  const ranged = transactions.filter((x: any) => {
    const d = String(x.transaction_date || x.created_at).slice(0, 10);
    return (
      (!from || d >= from) &&
      (!to || d <= to) &&
      (!ledgerItem || String(x.stock_id) === ledgerItem)
    );
  });

  return (
    <>
      <View style={s.tabs}>
        {[
          ['current', '♟ Current Stock'],
          ['item', '▤ Item Wise Report'],
          ['date', '▦ Date Wise Report'],
          ['ledger', '▣ Item Ledger'],
        ].map(([k, l]) => (
          <TouchableOpacity
            key={k}
            onPress={() => setTab(k)}
            style={[s.tab, tab === k && s.tabOn]}
          >
            <Text style={[s.tabText, tab === k && s.tabTextOn]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tab === 'current' && (
        <Panel title="Current Stock">
          <StockBalance stock={stock} onEdit={onEdit} />
        </Panel>
      )}
      {tab === 'item' && (
        <Panel title="Item Wise Report">
          <View style={s.reportFilters}>
            <DatePickerField label="From Date" value={itemFrom} onChange={setItemFrom} />
            <DatePickerField label="To Date" value={itemTo} onChange={setItemTo} />

            <View style={{ minWidth: 220, flex: 1, gap: 6 }}>
              <Text style={s.label}>Search Item:</Text>
              <TextInput
                value={itemSearch}
                onChangeText={setItemSearch}
                placeholder="🔍 Search item name..."
                style={s.stockSearchInput}
              />
            </View>

            <TouchableOpacity onPress={handleGenerateItemReport} style={s.generate}>
              <Text style={s.white}>⌕ Generate</Text>
            </TouchableOpacity>

            {isItemReportActive && (
              <TouchableOpacity onPress={handleResetItemReport} style={s.clearBtn}>
                <Text style={s.clearBtnText}>✕ Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {!isItemReportActive ? (
            <View style={s.emptyReportBox}>
              <Text style={s.emptyReportIcon}>📅</Text>
              <Text style={s.emptyReportTitle}>Please select Date to view Item Wise Report</Text>
              <Text style={s.emptyReportSub}>Choose "From Date" and "To Date" above, then click Generate.</Text>
            </View>
          ) : itemSummary.length === 0 ? (
            <View style={s.emptyReportBox}>
              <Text style={s.emptyReportIcon}>ℹ️</Text>
              <Text style={s.emptyReportTitle}>No transactions found for the selected period.</Text>
              <Text style={s.emptyReportSub}>Items with 0 transactions are excluded from the report.</Text>
            </View>
          ) : (
            <ScrollView horizontal>
              <View style={s.table}>
                <View style={[s.tr, s.th]}>
                  {['Item', 'Unit', 'Stock In', 'Stock Out', 'Current Balance'].map(
                    (h) => (
                      <Text key={h} style={s.cellHead}>
                        {h}
                      </Text>
                    )
                  )}
                </View>
                {itemSummary.map((x: any) => (
                  <View key={x.id} style={s.tr}>
                    <Text style={[s.cell, s.bold]}>{x.item_name}</Text>
                    <Text style={s.cell}>{x.unit}</Text>
                    <Text
                      style={[
                        s.cell,
                        {
                          color: Number(x.stockIn) > 0 ? '#198754' : '#212529',
                          fontWeight: Number(x.stockIn) > 0 ? '700' : '400',
                        },
                      ]}
                    >
                      {fmt(x.stockIn)}
                    </Text>
                    <Text
                      style={[
                        s.cell,
                        {
                          color: Number(x.stockOut) > 0 ? '#dc3545' : '#212529',
                          fontWeight: Number(x.stockOut) > 0 ? '700' : '400',
                        },
                      ]}
                    >
                      {fmt(x.stockOut)}
                    </Text>
                    <Text style={[s.cell, { fontWeight: '800' }]}>
                      {fmt(x.current_quantity)}
                    </Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
        </Panel>
      )}
      {tab === 'date' && (
        <Panel title="Date Wise Report">
          <ReportFilter from={from} setFrom={setFrom} to={to} setTo={setTo} />
          <TransactionTable rows={ranged} type="record" />
        </Panel>
      )}
      {tab === 'ledger' && (
        <Panel title="▣  Item Ledger">
          <View style={s.reportFilters}>
            <DatePickerField label="From Date" value={from} onChange={setFrom} />
            <DatePickerField label="To Date" value={to} onChange={setTo} />
            <Labeled label="Item">
              <Select
                label=""
                value={ledgerItem}
                onChange={setLedgerItem}
                options={[
                  { value: '', label: 'Select Item' },
                  ...stock.map((x: any) => ({
                    value: String(x.id),
                    label: x.item_name,
                  })),
                ]}
              />
            </Labeled>
            <TouchableOpacity style={s.generate}>
              <Text style={s.white}>⌕ Generate</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.print}
              onPress={() => {
                if (typeof window !== 'undefined') window.print();
              }}
            >
              <Text style={s.white}>Print</Text>
            </TouchableOpacity>
          </View>
          <LedgerTable
            rows={ranged.filter(
              (x: any) => ledgerItem && String(x.stock_id) === ledgerItem
            )}
          />
        </Panel>
      )}
    </>
  );
};

const ReportFilter = ({ from, setFrom, to, setTo }: any) => (
  <View style={s.reportFilters}>
    <DatePickerField label="From Date" value={from} onChange={setFrom} />
    <DatePickerField label="To Date" value={to} onChange={setTo} />
    <TouchableOpacity style={s.generate}>
      <Text style={s.white}>Generate</Text>
    </TouchableOpacity>
  </View>
);

const LedgerTable = ({ rows }: any) => (
  <ScrollView horizontal>
    <View style={s.table}>
      <View style={[s.tr, s.th]}>
        {[
          'Date',
          'Type',
          'Quantity',
          'Unit',
          'Opening',
          'Closing',
          'Remarks',
        ].map((h) => (
          <Text key={h} style={s.cellHead}>
            {h}
          </Text>
        ))}
      </View>
      {rows.length ? (
        rows.map((x: any) => (
          <View key={x.id} style={s.tr}>
            <Text style={s.cell}>{dateFmt(x.transaction_date || x.created_at)}</Text>
            <Text style={s.cell}>
              {x.transaction_type === 'in' ? 'Stock In' : 'Stock Out'}
            </Text>
            <Text style={s.cell}>{fmt(x.quantity)}</Text>
            <Text style={s.cell}>{x.unit}</Text>
            <Text style={s.cell}>{fmt(x.opening_quantity)}</Text>
            <Text style={s.cell}>{fmt(x.closing_quantity)}</Text>
            <Text style={s.cell}>{x.note || '-'}</Text>
          </View>
        ))
      ) : (
        <Text style={s.empty}>Select item and date range to view ledger.</Text>
      )}
    </View>
  </ScrollView>
);

const TransactionTable = ({ rows, type }: any) => (
  <ScrollView horizontal>
    <View style={s.table}>
      <View style={[s.tr, s.th]}>
        {[
          'Date',
          'Item',
          'Quantity',
          'Unit',
          ...(type === 'out' ? [] : ['Invoice No', 'Supplier', 'Rate']),
          'Opening',
          'Closing',
          'Remarks',
        ].map((h) => (
          <Text key={h} style={s.cellHead}>
            {h}
          </Text>
        ))}
      </View>
      {rows.length ? (
        rows.map((x: any) => (
          <View key={x.id} style={s.tr}>
            <Text style={s.cell}>{dateFmt(x.transaction_date || x.created_at)}</Text>
            <Text style={s.cell}>{x.item_name}</Text>
            <Text style={s.cell}>{fmt(x.quantity)}</Text>
            <Text style={s.cell}>{x.unit}</Text>
            {type !== 'out' && (
              <>
                <Text style={s.cell}>{x.invoice_no || '-'}</Text>
                <Text style={s.cell}>{x.supplier_name || '-'}</Text>
                <Text style={s.cell}>{fmt(x.rate)}</Text>
              </>
            )}
            <Text style={s.cell}>{fmt(x.opening_quantity)}</Text>
            <Text style={s.cell}>{fmt(x.closing_quantity)}</Text>
            <Text style={s.cell}>{x.note || '-'}</Text>
          </View>
        ))
      ) : (
        <Text style={s.empty}>No transaction found.</Text>
      )}
    </View>
  </ScrollView>
);

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eef1fb' },
  body: {
    padding: 16,
    maxWidth: 1800,
    width: '100%',
    alignSelf: 'center',
    gap: 16,
  },
  dialog: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d7dce3',
  },
  dialogHead: { backgroundColor: '#11101e', padding: 24 },
  dialogTitle: { fontSize: 24, fontWeight: '900', color: '#fff' },
  menuGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13, padding: 24 },
  menu: {
    width: '31%',
    minWidth: 240,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderWidth: 1,
    borderColor: '#d9dee6',
    backgroundColor: '#f8fafc',
    padding: 20,
    borderRadius: 11,
  },
  arrow: { fontSize: 28, color: '#004b7c' },
  menuText: { fontSize: 18, fontWeight: '800', color: '#172033' },
  pageNav: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  back: {
    paddingVertical: 9,
    paddingHorizontal: 13,
    backgroundColor: '#dce8f4',
    borderRadius: 7,
  },
  backText: { fontWeight: '800', color: '#174f75' },
  createItemTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 15,
    backgroundColor: '#655fdb',
    borderRadius: 7,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  createItemTopBtnText: {
    fontWeight: '800',
    color: '#ffffff',
    fontSize: 14,
  },
  editItemTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 15,
    backgroundColor: '#e67e22',
    borderRadius: 7,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  editItemTopBtnText: {
    fontWeight: '800',
    color: '#ffffff',
    fontSize: 14,
  },
  editRowBtn: {
    backgroundColor: '#fff3cd',
    borderWidth: 1,
    borderColor: '#ffeeba',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 5,
    alignSelf: 'center',
  },
  editRowBtnText: {
    color: '#856404',
    fontWeight: '800',
    fontSize: 13,
  },

  // Date Filter Styles
  dateFilterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
  },
  dateFilterBtnActive: {
    backgroundColor: '#e7f1ff',
    borderColor: '#0d6efd',
  },
  dateFilterBtnActiveText: {
    color: '#0d6efd',
    fontWeight: '800',
    fontSize: 13,
  },
  dateFilterBtnInactive: {
    backgroundColor: '#f8f9fa',
    borderColor: '#ced4da',
  },
  dateFilterBtnInactiveText: {
    color: '#495057',
    fontWeight: '700',
    fontSize: 13,
  },
  clearDateFilterBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#6c757d',
  },
  clearDateFilterBtnText: {
    color: '#495057',
    fontWeight: '700',
    fontSize: 12,
  },

  // Stock Balance Filter Tabs & Badges
  stockFilterTab: {
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ced4da',
    backgroundColor: '#fff',
  },
  stockFilterTabActive: {
    backgroundColor: '#655fdb',
    borderColor: '#655fdb',
  },
  stockFilterTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#495057',
  },
  stockFilterTabTextActive: {
    color: '#fff',
  },
  stockSearchInput: {
    height: 36,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    minWidth: 200,
    fontSize: 13,
    color: '#212529',
  },
  zeroRow: {
    backgroundColor: '#ffffff',
  },
  inStockRow: {
    backgroundColor: '#f8fff9',
  },
  zeroBadge: {
    backgroundColor: '#f1f3f5',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  zeroBadgeText: {
    color: '#6c757d',
    fontSize: 11,
    fontWeight: '700',
  },
  inStockBadge: {
    backgroundColor: '#d1e7dd',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#badbcc',
  },
  inStockBadgeText: {
    color: '#0f5132',
    fontSize: 11,
    fontWeight: '800',
  },

  // Item Wise Report Empty & Reset Styles
  emptyReportBox: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginVertical: 12,
  },
  emptyReportIcon: {
    fontSize: 28,
  },
  emptyReportTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  emptyReportSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
  clearBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#6c757d',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 7,
  },
  clearBtnText: {
    color: '#495057',
    fontWeight: '700',
    fontSize: 14,
  },

  // Modal Styles
  modalBackdrop: {
    ...(Platform.OS === 'web'
      ? {
        position: 'fixed' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }
      : StyleSheet.absoluteFill),
    backgroundColor: 'rgba(17, 16, 30, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 520,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHead: {
    backgroundColor: '#655fdb',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalCloseText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
    gap: 16,
  },
  modalField: {
    gap: 7,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212529',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: '#fff',
    minHeight: 40,
    color: '#212529',
  },
  modalRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 6,
    backgroundColor: '#f1f3f5',
  },
  modalCancelText: {
    color: '#495057',
    fontWeight: '700',
    fontSize: 14,
  },
  modalSaveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 6,
    backgroundColor: '#655fdb',
  },
  modalSaveText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 14,
  },

  // Bulk Entry Styles matching user template
  bulkCardWrapper: {
    gap: 12,
  },
  bulkTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 6,
  },
  dateGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#212529',
  },
  dateInputWrap: {
    borderWidth: 2,
    borderColor: '#212529',
    backgroundColor: '#fff',
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dateTextInput: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    minWidth: 110,
    height: 30,
  },
  badgeTag: {
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  badgeOut: {
    backgroundColor: '#ea4c89', // Pinkish magenta matching user screenshot
  },
  badgeIn: {
    backgroundColor: '#198754', // Green for Stock In
  },
  badgeTagText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  inHeaderExtras: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  extraField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  extraLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#444',
  },
  extraInput: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 13,
    minWidth: 110,
    height: 32,
  },

  // Main Form Card with warm salmon/peach tone
  bulkFormContainer: {
    backgroundColor: '#fcd3c7', // Warm peach tone matching screenshot
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f5b5a6',
    padding: 16,
    gap: 12,
  },
  rowsTable: {
    gap: 10,
    minWidth: 1150,
  },
  rowItemLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#212529',
  },

  // 1. Item Name Cell
  cellItemName: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 255,
  },
  inputWithDatalist: {
    width: 175,
  },
  cellTextInputItem: {
    width: 175,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 8,
    fontSize: 14,
    color: '#212529',
  },

  // 2. Quantity Cell
  cellQuantity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 135,
  },
  cellTextInputQty: {
    width: 65,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 14,
    color: '#212529',
  },
  cellInputError: {
    borderColor: '#dc3545',
    backgroundColor: '#ffeef0',
  },

  // 3. Unit Cell
  cellUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 150,
  },

  // 4. Available Balance Cell (Stock Out)
  cellBalance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 200,
  },
  balanceGreenBadge: {
    backgroundColor: '#d8f0dd', // Soft green badge
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#bce5c5',
  },
  balanceBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#155724',
  },
  balanceValueBox: {
    width: 65,
    height: 36,
    backgroundColor: '#f1f3f5',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceValueText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#155724',
  },

  // 4b. Rate Cell (Stock In)
  cellRate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 200,
  },
  cellTextInputRate: {
    width: 65,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontSize: 13,
    color: '#212529',
  },
  rateTotalBox: {
    width: 80,
    height: 36,
    backgroundColor: '#e9ecef',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rateTotalText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#495057',
  },

  // 5. Description Cell
  cellDescription: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 280,
  },
  cellTextInputDesc: {
    flex: 1,
    height: 36,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#212529',
  },

  // 6. Action Cell (+Add / Remove)
  cellActions: {
    width: 65,
    alignItems: 'flex-start',
  },
  actionBtnText: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0d6efd',
  },
  removeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0d6efd',
  },

  // Save Bar
  saveBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f5b5a6',
  },
  addMoreBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#0d6efd',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 5,
  },
  addMoreBtnText: {
    color: '#0d6efd',
    fontWeight: '800',
    fontSize: 13,
  },
  saveButton: {
    backgroundColor: '#0d6efd', // Vibrant blue matching screenshot Save button
    paddingVertical: 8,
    paddingHorizontal: 22,
    borderRadius: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonIcon: {
    color: '#fff',
    fontSize: 15,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },

  // Panels & Standard Styles
  panel: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccd3dc',
    borderRadius: 7,
    overflow: 'hidden',
  },
  panelHead: { padding: 13, backgroundColor: '#655fdb' },
  panelHeadOut: { backgroundColor: '#ea4c89' },
  panelTitle: { color: '#fff', fontSize: 17, fontWeight: '900' },
  panelBody: { padding: 18, gap: 16 },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  fieldBox: { minWidth: 230, flex: 1, gap: 8 },
  wide: { minWidth: 480, flexGrow: 2 },
  label: { fontSize: 16, color: '#172033' },
  input: {
    borderWidth: 1,
    borderColor: '#d3dae3',
    borderRadius: 7,
    padding: 11,
    minHeight: 43,
    backgroundColor: '#fff',
  },
  save: {
    alignSelf: 'flex-start',
    backgroundColor: '#086ef5',
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderRadius: 7,
  },
  white: { color: '#fff', fontWeight: '800' },
  table: { minWidth: 1100 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#d8dde5' },
  th: { backgroundColor: '#f2f4f7' },
  cellHead: { width: 135, padding: 12, fontWeight: '900' },
  cell: { width: 135, padding: 12 },
  empty: { padding: 18, color: '#667085' },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderColor: '#ddd',
  },
  low: { backgroundColor: '#fff1e8' },
  bold: { fontWeight: '800' },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderColor: '#d4d8df',
  },
  tab: { paddingVertical: 14, paddingHorizontal: 18 },
  tabOn: {
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#d4d8df',
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  tabText: { fontSize: 16, color: '#344054' },
  tabTextOn: { color: '#12b76a', fontWeight: '900' },
  reportFilters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    alignItems: 'flex-end',
  },
  generate: {
    backgroundColor: '#086ef5',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 7,
  },
  print: {
    backgroundColor: '#12a66a',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 7,
  },
});
