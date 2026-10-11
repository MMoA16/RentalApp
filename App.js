import React, { useEffect, useState } from 'react';
import { SafeAreaView, View, Text, FlatList, Button, Modal, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'rental_properties_v1';

const sampleProperties = Array.from({ length: 30 }, (_, i) => ({
  id: (i + 1).toString(),
  name: `House ${i + 1}`,
  monthlyRent: (800 + i * 10).toString(),
  deposit: '1500',
  balance: '0',
  currentBill: '0',
  waterBill: '0',
}));

export default function App() {
  const [properties, setProperties] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: '', monthlyRent: '', deposit: '', balance: '', currentBill: '', waterBill: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        setProperties(JSON.parse(raw));
      } else {
        setProperties(sampleProperties);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sampleProperties));
      }
    } catch (e) {
      console.warn('Load error', e);
    }
  }

  async function save(newProps) {
    setProperties(newProps);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newProps));
    } catch (e) {
      console.warn('Save error', e);
    }
  }

  function openNew() {
    setEditingId(null);
    setForm({ name: '', monthlyRent: '', deposit: '', balance: '', currentBill: '', waterBill: '' });
    setModalVisible(true);
  }

  function openEdit(item) {
    setEditingId(item.id);
    setForm({ ...item });
    setModalVisible(true);
  }

  function confirmDelete(id) {
    Alert.alert('Delete', 'Delete this property?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { const newP = properties.filter(p => p.id !== id); await save(newP); } }
    ]);
  }

  async function onSaveForm() {
    if (!form.name) { Alert.alert('Validation', 'Name is required'); return; }
    if (editingId) {
      const updated = properties.map(p => p.id === editingId ? { ...form, id: editingId } : p);
      await save(updated);
    } else {
      const id = Date.now().toString();
      const newP = [{ ...form, id }, ...properties];
      await save(newP);
    }
    setModalVisible(false);
  }

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.title}>{item.name}</Text>
      <Text>Monthly Rent: ${item.monthlyRent}</Text>
      <Text>Deposit: ${item.deposit}</Text>
      <Text>Balance: ${item.balance}</Text>
      <Text>Current Bill: ${item.currentBill}</Text>
      <Text>Water Bill: ${item.waterBill}</Text>
      <View style={styles.actions}>
        <Button title="Edit" onPress={() => openEdit(item)} />
        <View style={{ width: 12 }} />
        <Button title="Delete" color="red" onPress={() => confirmDelete(item.id)} />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Rental Manager</Text>
        <Button title="Add" onPress={openNew} />
      </View>

      <FlatList data={properties} keyExtractor={i => i.id} renderItem={renderItem} contentContainerStyle={{ padding: 12 }} />

      <Modal visible={modalVisible} animationType="slide">
        <SafeAreaView style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text style={styles.formTitle}>{editingId ? 'Edit Property' : 'Add Property'}</Text>

            <Input label="Name" value={form.name} onChangeText={val => setForm({ ...form, name: val })} />
            <Input label="Monthly Rent" keyboardType="numeric" value={form.monthlyRent} onChangeText={val => setForm({ ...form, monthlyRent: val })} />
            <Input label="Deposit" keyboardType="numeric" value={form.deposit} onChangeText={val => setForm({ ...form, deposit: val })} />
            <Input label="Balance" keyboardType="numeric" value={form.balance} onChangeText={val => setForm({ ...form, balance: val })} />
            <Input label="Current Bill" keyboardType="numeric" value={form.currentBill} onChangeText={val => setForm({ ...form, currentBill: val })} />
            <Input label="Water Bill" keyboardType="numeric" value={form.waterBill} onChangeText={val => setForm({ ...form, waterBill: val })} />

            <View style={{ height: 12 }} />
            <Button title="Save" onPress={onSaveForm} />
            <View style={{ height: 8 }} />
            <Button title="Cancel" color="gray" onPress={() => setModalVisible(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const Input = ({ label, value, onChangeText, keyboardType = 'default' }) => (
  <View style={{ marginBottom: 12 }}>
    <Text style={{ marginBottom: 6, fontWeight: '600' }}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} keyboardType={keyboardType} style={styles.input} />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fb' },
  header: { padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff' },
  headerText: { fontSize: 20, fontWeight: '700' },
  card: { backgroundColor: '#fff', padding: 12, borderRadius: 8, marginBottom: 10, elevation: 1 },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  actions: { flexDirection: 'row', marginTop: 8 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 6, backgroundColor: '#fff' },
  formTitle: { fontSize: 18, fontWeight: '700', marginBottom: 12 }
});
