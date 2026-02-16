// Minimal shim to satisfy TypeScript when editing RN files in a web project
// This does NOT make React Native work in the browser; it only fixes IDE errors.
declare module 'react-native' {
  import * as React from 'react';

  export const View: React.ComponentType<any>;
  export const Text: React.ComponentType<any>;
  export const TextInput: React.ComponentType<any>;
  export const TouchableOpacity: React.ComponentType<any>;
  export const FlatList: React.ComponentType<any>;
  export const SafeAreaView: React.ComponentType<any>;

  export const StyleSheet: {
    create<T extends { [key: string]: any }>(styles: T): T;
  };

  export const Platform: {
    OS: 'ios' | 'android' | 'web' | string;
    select<T>(spec: { ios?: T; android?: T; web?: T; default?: T }): T;
  };
}
