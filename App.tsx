import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import OmniBus from './components/OmniBus';

export default function App() {
  return (
    <View style={styles.container}>
      <OmniBus />
      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1e1e1e',
  },
});
