import type { NavigatorScreenParams } from '@react-navigation/native';

/**
 * Home pushes its own copies of the detail screens rather than jumping into
 * the Settings tab. Sending the user across tabs left them stranded: Back from
 * Accounts landed on Settings, not on the Home they came from.
 */
export type HomeStackParams = {
  HomeMain: undefined;
  AddExpense: { id?: string };
  IncomeEditor: { id?: string };
  BankImport: undefined;
  History: undefined;
  CategoryBreakdown: undefined;
  Profile: undefined;
  RecurringIncome: undefined;
  RecurringIncomeEditor: { id?: string };
  Accounts: undefined;
  AccountEditor: { id?: string };
  Budgets: undefined;
  Goals: undefined;
  GoalEditor: { id?: string };
  RecurringExpenses: undefined;
  RecurringExpenseEditor: { id?: string; dayOfMonth?: number };
  HomeCards: undefined;
};

export type CalendarStackParams = {
  CalendarHome: undefined;
  EventEditor: { id?: string; date: string };
};

export type SharedStackParams = {
  SharedHome: undefined;
  SharedExpenseEditor: { id?: string };
  ScanReceipt: undefined;
  People: undefined;
};

export type SettingsStackParams = {
  SettingsHome: undefined;
  Profile: undefined;
  // The four category screens the hub leads to.
  AppPreferences: undefined;
  MoneySettings: undefined;
  DataSettings: undefined;
  RecurringIncome: undefined;
  RecurringIncomeEditor: { id?: string };
  Accounts: undefined;
  AccountEditor: { id?: string };
  HomeCards: undefined;
  Budgets: undefined;
  Currency: undefined;
  Goals: undefined;
  GoalEditor: { id?: string };
  RecurringExpenses: undefined;
  // `dayOfMonth` prefills the day when the editor is opened from a calendar
  // square, so tapping the 20th starts a bill that falls on the 20th.
  RecurringExpenseEditor: { id?: string; dayOfMonth?: number };
  Legal: { kind: 'privacy' | 'terms' };
};

export type RootTabParams = {
  Home: NavigatorScreenParams<HomeStackParams>;
  Calendar: NavigatorScreenParams<CalendarStackParams>;
  Shared: NavigatorScreenParams<SharedStackParams>;
  Settings: NavigatorScreenParams<SettingsStackParams>;
};
