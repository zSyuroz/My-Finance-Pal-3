import 'react-native-gesture-handler';
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo';
import {
  SpaceMono_400Regular,
  SpaceMono_700Bold,
} from '@expo-google-fonts/space-mono';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  CommonActions,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrencyProvider } from './src/CurrencyContext';

import HomeScreen from './src/screens/HomeScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import IncomeEditorScreen from './src/screens/IncomeEditorScreen';
import BankImportScreen from './src/screens/BankImportScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import EventEditorScreen from './src/screens/EventEditorScreen';
import NotesScreen from './src/screens/NotesScreen';
import NoteEditorScreen from './src/screens/NoteEditorScreen';
import AccountsScreen from './src/screens/AccountsScreen';
import CategoryBreakdownScreen from './src/screens/CategoryBreakdownScreen';
import CurrencyScreen from './src/screens/CurrencyScreen';
import HomeCardsScreen from './src/screens/HomeCardsScreen';
import BudgetsScreen from './src/screens/BudgetsScreen';
import GoalsScreen from './src/screens/GoalsScreen';
import PeopleScreen from './src/screens/PeopleScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SharedExpenseEditorScreen from './src/screens/SharedExpenseEditorScreen';
import ScanReceiptScreen from './src/screens/ScanReceiptScreen';
import SharedScreen from './src/screens/SharedScreen';
import PayRhythmScreen from './src/screens/PayRhythmScreen';
import RecurringExpensesScreen from './src/screens/RecurringExpensesScreen';
import RecurringExpenseEditorScreen from './src/screens/RecurringExpenseEditorScreen';
import LegalScreen from './src/screens/LegalScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TabBarIcon from './src/components/TabBarIcon';
import BackButton from './src/components/BackButton';
import WebFrame from './src/components/WebFrame';
import { isOnboardingComplete } from './src/db';
import { ThemeProvider, useTheme } from './src/ThemeContext';
import { font, type Theme } from './src/theme';
import type {
  HomeStackParams,
  CalendarStackParams,
  NotesStackParams,
  SettingsStackParams,
  SharedStackParams,
  RootTabParams,
} from './src/navigation';

SplashScreen.preventAutoHideAsync();

const Tab = createBottomTabNavigator<RootTabParams>();
const HomeStack = createNativeStackNavigator<HomeStackParams>();
const CalendarStack = createNativeStackNavigator<CalendarStackParams>();
const NotesStack = createNativeStackNavigator<NotesStackParams>();
const SettingsStack = createNativeStackNavigator<SettingsStackParams>();
const SharedStack = createNativeStackNavigator<SharedStackParams>();

/**
 * Tapping a tab always shows that tab's root screen, even if it was left
 * mid-editor (e.g. Add expense) — but never at the cost of silently losing
 * an unsaved draft. Resetting a background stack's state directly (e.g.
 * `navigation.navigate(tab, { screen: root })`) does NOT run a pushed
 * screen's `beforeRemove` guard, so it can blow away unsaved edits with no
 * prompt. A real `GO_BACK` action does respect that guard (it's the same
 * action the header's own back button dispatches) — dispatched from the root
 * container ref with an explicit `target`, it can reach a stack that's sat
 * in a background tab, which a screen-level `navigation.dispatch` can't. We
 * pop one screen at a time, stopping the moment a pop doesn't go through (a
 * guard caught it and is showing its own "discard changes?" dialog).
 */
function resetTabToRoot(navigationRef: { current: any }, tabName: string) {
  const popOnce = () => {
    const root = navigationRef.current;
    const state = root?.getState?.();
    const tabRoute = state?.routes.find((r: any) => r.name === tabName);
    const nested = tabRoute?.state;
    if (!root || !nested || nested.index === 0) return; // already at (or now at) the root

    const beforeIndex = nested.index;
    root.dispatch({ ...CommonActions.goBack(), target: nested.key });

    setTimeout(() => {
      const after = navigationRef.current
        ?.getState?.()
        ?.routes.find((r: any) => r.name === tabName)?.state;
      if (after && after.index < beforeIndex && after.index > 0) {
        popOnce();
      }
    }, 50);
  };
  setTimeout(popOnce, 0);
}

function stackHeaderOptions(c: Theme): NativeStackNavigationOptions {
  return {
    headerStyle: { backgroundColor: c.haze },
    headerShadowVisible: false,
    headerTitleStyle: { color: c.text, fontFamily: font.displaySemi },
    headerTintColor: c.iris,
    headerLeft: () => <BackButton />,
    contentStyle: { backgroundColor: c.haze },
  };
}

function HomeStackScreen() {
  const { colors } = useTheme();
  return (
    <HomeStack.Navigator screenOptions={stackHeaderOptions(colors)}>
      <HomeStack.Screen
        name="HomeMain"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <HomeStack.Screen name="AddExpense" component={AddExpenseScreen} />
      <HomeStack.Screen name="IncomeEditor" component={IncomeEditorScreen} />
      <HomeStack.Screen
        name="BankImport"
        component={BankImportScreen}
        options={{ title: 'Import statement' }}
      />
      <HomeStack.Screen name="History" component={HistoryScreen} options={{ title: 'History' }} />
      <HomeStack.Screen
        name="CategoryBreakdown"
        component={CategoryBreakdownScreen}
        options={{ title: 'Where it goes' }}
      />
      {/* The same components the Settings tab registers. A screen reached from
          Home belongs to Home's history, so Back returns there. */}
      <HomeStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      <HomeStack.Screen
        name="PayRhythm"
        component={PayRhythmScreen}
        options={{ title: 'Pay rhythm' }}
      />
      <HomeStack.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{ title: 'Accounts & net worth' }}
      />
      <HomeStack.Screen name="Budgets" component={BudgetsScreen} options={{ title: 'Budgets' }} />
      <HomeStack.Screen
        name="HomeCards"
        component={HomeCardsScreen}
        options={{ title: 'Home cards' }}
      />
    </HomeStack.Navigator>
  );
}

function CalendarStackScreen() {
  const { colors } = useTheme();
  return (
    <CalendarStack.Navigator screenOptions={stackHeaderOptions(colors)}>
      <CalendarStack.Screen
        name="CalendarHome"
        component={CalendarScreen}
        options={{ headerShown: false }}
      />
      <CalendarStack.Screen name="EventEditor" component={EventEditorScreen} />
    </CalendarStack.Navigator>
  );
}

function NotesStackScreen() {
  const { colors } = useTheme();
  return (
    <NotesStack.Navigator screenOptions={stackHeaderOptions(colors)}>
      <NotesStack.Screen
        name="NotesHome"
        component={NotesScreen}
        options={{ headerShown: false }}
      />
      <NotesStack.Screen name="NoteEditor" component={NoteEditorScreen} />
    </NotesStack.Navigator>
  );
}

function SharedStackScreen() {
  const { colors } = useTheme();
  return (
    <SharedStack.Navigator screenOptions={stackHeaderOptions(colors)}>
      <SharedStack.Screen
        name="SharedHome"
        component={SharedScreen}
        options={{ headerShown: false }}
      />
      <SharedStack.Screen
        name="SharedExpenseEditor"
        component={SharedExpenseEditorScreen}
      />
      <SharedStack.Screen
        name="ScanReceipt"
        component={ScanReceiptScreen}
        options={{ title: 'Scan receipt' }}
      />
      <SharedStack.Screen name="People" component={PeopleScreen} options={{ title: 'People' }} />
    </SharedStack.Navigator>
  );
}

function SettingsStackScreen() {
  const { colors } = useTheme();
  return (
    <SettingsStack.Navigator screenOptions={stackHeaderOptions(colors)}>
      <SettingsStack.Screen
        name="SettingsHome"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
      <SettingsStack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
      <SettingsStack.Screen
        name="PayRhythm"
        component={PayRhythmScreen}
        options={{ title: 'Pay rhythm' }}
      />
      <SettingsStack.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{ title: 'Accounts & net worth' }}
      />
      <SettingsStack.Screen
        name="HomeCards"
        component={HomeCardsScreen}
        options={{ title: 'Home cards' }}
      />
      <SettingsStack.Screen
        name="Currency"
        component={CurrencyScreen}
        options={{ title: 'Currency' }}
      />
      <SettingsStack.Screen
        name="Budgets"
        component={BudgetsScreen}
        options={{ title: 'Budgets' }}
      />
      <SettingsStack.Screen
        name="Goals"
        component={GoalsScreen}
        options={{ title: 'Goals' }}
      />
      <SettingsStack.Screen
        name="RecurringExpenses"
        component={RecurringExpensesScreen}
        options={{ title: 'Recurring expenses' }}
      />
      <SettingsStack.Screen
        name="RecurringExpenseEditor"
        component={RecurringExpenseEditorScreen}
      />
      <SettingsStack.Screen name="Legal" component={LegalScreen} />
    </SettingsStack.Navigator>
  );
}

function RootNavigation() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const navigationRef = useNavigationContainerRef<RootTabParams>();

  useEffect(() => {
    isOnboardingComplete().then(setOnboarded);
  }, []);

  const navTheme = {
    ...(scheme === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(scheme === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: colors.iris,
      background: colors.haze,
      card: colors.haze,
      text: colors.text,
      border: colors.line,
    },
  };

  if (onboarded === null) {
    return <View style={{ flex: 1, backgroundColor: colors.haze }} />;
  }

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {!onboarded ? (
        <OnboardingScreen onDone={() => setOnboarded(true)} />
      ) : (
        <Tab.Navigator
          initialRouteName="Home"
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.iris,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: { fontFamily: font.bodySemi, fontSize: 11 },
            // The bar has to sit above the system's own navigation, not
            // under it. A fixed height ignores the gesture bar or the on-screen
            // back/home buttons, so Android draws its controls straight over
            // the tabs. Growing by the bottom inset keeps the labels clear on
            // every device, and costs nothing where the inset is zero.
            tabBarStyle: {
              backgroundColor: colors.mist,
              borderTopColor: colors.line,
              height: 60 + insets.bottom,
              paddingTop: 6,
              paddingBottom: 8 + insets.bottom,
            },
          }}
        >
          <Tab.Screen
            name="Home"
            component={HomeStackScreen}
            options={{ tabBarIcon: (p) => <TabBarIcon name="home" {...p} /> }}
            listeners={{
              tabPress: () => resetTabToRoot(navigationRef, 'Home'),
            }}
          />
          <Tab.Screen
            name="Calendar"
            component={CalendarStackScreen}
            options={{ tabBarIcon: (p) => <TabBarIcon name="calendar" {...p} /> }}
            listeners={{
              tabPress: () => resetTabToRoot(navigationRef, 'Calendar'),
            }}
          />
          <Tab.Screen
            name="Notes"
            component={NotesStackScreen}
            options={{ tabBarIcon: (p) => <TabBarIcon name="notes" {...p} /> }}
            listeners={{
              tabPress: () => resetTabToRoot(navigationRef, 'Notes'),
            }}
          />
          <Tab.Screen
            name="Shared"
            component={SharedStackScreen}
            options={{ tabBarIcon: (p) => <TabBarIcon name="shared" {...p} /> }}
            listeners={{
              tabPress: () => resetTabToRoot(navigationRef, 'Shared'),
            }}
          />
          <Tab.Screen
            name="Settings"
            component={SettingsStackScreen}
            options={{ tabBarIcon: (p) => <TabBarIcon name="settings" {...p} /> }}
            listeners={{
              tabPress: () => resetTabToRoot(navigationRef, 'Settings'),
            }}
          />
        </Tab.Navigator>
      )}
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    SpaceMono_400Regular,
    SpaceMono_700Bold,
  });

  const onReady = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <CurrencyProvider>
        <ThemeProvider>
          <WebFrame>
            <RootNavigation />
          </WebFrame>
        </ThemeProvider>
        </CurrencyProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
