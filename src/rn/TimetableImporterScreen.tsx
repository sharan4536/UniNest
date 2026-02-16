/// <reference path="../types/react-native.d.ts" />
import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { parseTimetable, type ParsedClass } from '../utils/timetableParser';

export default function TimetableImporterScreen() {
  const [raw, setRaw] = useState('');
  const [items, setItems] = useState<ParsedClass[]>([]);

  const onImport = () => {
    try {
      const results = parseTimetable(raw);
      setItems(results);
    } catch (e) {
      console.error('Failed to parse timetable', e);
    }
  };

  const renderItem = ({ item }: { item: ParsedClass }) => (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.courseCode} · {item.classType}</Text>
      <Text style={styles.cardRow}><Text style={styles.bold}>Day:</Text> {item.day}</Text>
      <Text style={styles.cardRow}><Text style={styles.bold}>Time:</Text> {item.startTime} - {item.endTime}</Text>
      {!!item.location && (
        <Text style={styles.cardRow}><Text style={styles.bold}>Location:</Text> {item.location}</Text>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>Timetable Importer</Text>
        <Text style={styles.label}>Paste your raw timetable text</Text>
        <TextInput
          style={styles.input}
          placeholder="Paste your full timetable text here..."
          placeholderTextColor="#888"
          multiline
          value={raw}
          onChangeText={setRaw}
        />
        <TouchableOpacity style={styles.button} onPress={onImport}>
          <Text style={styles.buttonText}>Import Schedule</Text>
        </TouchableOpacity>
        <Text style={styles.counter}>{items.length} classes found</Text>

        <FlatList
          data={items}
          keyExtractor={(item, idx) => `${item.day}-${item.courseCode}-${item.startTime}-${idx}`}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          contentContainerStyle={{ paddingVertical: 8 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f6f8fb',
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
  },
  input: {
    minHeight: 150,
    borderWidth: 1,
    borderColor: '#d0d7de',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
    color: '#111',
    textAlignVertical: 'top',
  },
  button: {
    marginTop: 10,
    backgroundColor: '#C6ECFF',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#000',
    fontWeight: '600',
  },
  counter: {
    marginTop: 8,
    color: '#555',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  cardTitle: {
    fontWeight: '600',
    marginBottom: 4,
  },
  cardRow: {
    fontSize: 14,
    color: '#333',
    marginTop: 2,
  },
  bold: {
    fontWeight: '600',
  },
});
