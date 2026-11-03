import {View, Text, Pressable} from 'react-native';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export default function BirthDateField({value, onChange}: Props) {
  function openCalendar() {
    // Fecha inicial del calendario; no se guarda hasta confirmar.
    let initialDate = new Date(2000, 0, 1);

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
  const [year, month, day] = value.split('-').map(Number);

  if (
    year !== undefined &&
    month !== undefined &&
    day !== undefined
  ) {
    const candidate = new Date(year, month - 1, day);

    if (
      formatDate(candidate) === value &&
      candidate <= new Date()
    ) {
      initialDate = candidate;
    }
  }
}
    DateTimePickerAndroid.open({
      value: initialDate,
      mode: 'date',
      display: 'calendar',
      minimumDate: new Date(1900, 0, 1),
      maximumDate: new Date(),
      onValueChange: (_event, selectedDate) => onChange(formatDate(selectedDate)),
    });
  }

  return (
    <View style={{marginVertical: 8}}>
      <Text style={{marginBottom: 6}}>Fecha de nacimiento</Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Seleccionar fecha de nacimiento"
        onPress={openCalendar}
        style={{
          padding: 14,
          borderWidth: 1,
          borderColor: '#888',
          borderRadius: 8,
          backgroundColor: '#fff',
        }}>
        <Text style={{color: '#222'}}>
          {value
            ? value.split('-').reverse().join('/')
            : 'Seleccionar fecha'}
        </Text>
      </Pressable>
    </View>
  );
}

