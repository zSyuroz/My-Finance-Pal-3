import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import AppText from '../components/AppText';
import ConfirmDialog from '../components/ConfirmDialog';
import { Chevron, makeSettingsStyles, SettingsRow } from '../components/SettingsRow';
import { exportData, pickAndImportData } from '../backup';
import { eraseAllData } from '../db';
import { useTheme } from '../ThemeContext';
import type { SettingsStackParams } from '../navigation';

type Props = NativeStackScreenProps<SettingsStackParams, 'DataSettings'>;

export default function DataScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeSettingsStyles(colors), [colors]);

  const [exportBusy, setExportBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [eraseVisible, setEraseVisible] = useState(false);
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);

  const onExport = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      await exportData();
    } catch (err) {
      setDialog({
        title: 'Export failed',
        message: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setExportBusy(false);
    }
  };

  const onImportConfirmed = async () => {
    setImportConfirmVisible(false);
    setImportBusy(true);
    try {
      const summary = await pickAndImportData();
      if (summary) {
        const parts = [
          summary.events && `${summary.events} event${summary.events === 1 ? '' : 's'}`,
          summary.documents && `${summary.documents} note${summary.documents === 1 ? '' : 's'}`,
          summary.expenses && `${summary.expenses} expense${summary.expenses === 1 ? '' : 's'}`,
          summary.income && `${summary.income} income entr${summary.income === 1 ? 'y' : 'ies'}`,
          summary.recurring &&
            `${summary.recurring} recurring rule${summary.recurring === 1 ? '' : 's'}`,
          summary.shared && `${summary.shared} shared expense${summary.shared === 1 ? '' : 's'}`,
          summary.accounts && `${summary.accounts} account${summary.accounts === 1 ? '' : 's'}`,
          summary.budgets && `${summary.budgets} budget${summary.budgets === 1 ? '' : 's'}`,
          summary.goals && `${summary.goals} goal${summary.goals === 1 ? '' : 's'}`,
        ].filter(Boolean);
        setDialog({
          title: 'Import complete',
          message: parts.length
            ? `Imported ${parts.join(', ')}.`
            : 'That backup was empty — nothing to import.',
        });
      }
    } catch (err) {
      setDialog({
        title: 'Import failed',
        message: err instanceof Error ? err.message : 'Something went wrong.',
      });
    } finally {
      setImportBusy(false);
    }
  };

  const busyOrChevron = (busy: boolean) =>
    busy ? <ActivityIndicator color={colors.textMuted} /> : <Chevron />;

  return (
    <ScrollView style={styles.safe} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <SettingsRow
          icon="export"
          label="Export data"
          onPress={onExport}
          right={busyOrChevron(exportBusy)}
        />
        <SettingsRow
          icon="import"
          label="Import data"
          onPress={() => setImportConfirmVisible(true)}
          right={busyOrChevron(importBusy)}
        />
        {/* Last in the section it belongs to: exporting, importing and erasing
            are the same subject, and the destructive one goes at the bottom. */}
        <SettingsRow
          icon="trash"
          label="Erase all data"
          last
          destructive
          onPress={() => setEraseVisible(true)}
          right={<Chevron />}
        />
      </View>

      <AppText variant="body" muted style={styles.hint}>
        Move everything to a new phone: export here, then open this app on the new phone and import
        the file.
      </AppText>

      <ConfirmDialog
        visible={importConfirmVisible}
        title="Import data?"
        message="Pick a My Finance Pal backup file. What it contains will be merged into what's already on this device — items with matching IDs are overwritten."
        confirmLabel="Choose file"
        cancelLabel="Cancel"
        onConfirm={onImportConfirmed}
        onCancel={() => setImportConfirmVisible(false)}
      />

      <ConfirmDialog
        visible={eraseVisible}
        title="Erase everything?"
        message={
          'This deletes every event, expense, income entry, recurring rule, person, ' +
          'shared bill and payment on this device, and returns the app to its first run.\n\n' +
          'There is no undo and no copy anywhere else — export your data first if you might ' +
          'want it back.'
        }
        confirmLabel="Erase everything"
        cancelLabel="Cancel"
        destructive
        requireText="CONFIRM"
        onConfirm={async () => {
          setEraseVisible(false);
          await eraseAllData();
          // Every screen re-reads its data when focused, so navigating home is
          // enough to clear the visible app. The first-run flow is decided once
          // at launch though, so on a phone that part waits for a restart —
          // said plainly rather than pretending the reset was total.
          if (Platform.OS === 'web') {
            window.location.reload();
          } else {
            setDialog({
              title: 'Everything erased',
              message:
                'All your data is gone from this device. Close and reopen the app to start from the welcome screen.',
            });
            navigation.navigate('SettingsHome');
          }
        }}
        onCancel={() => setEraseVisible(false)}
      />

      <ConfirmDialog
        visible={!!dialog}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        confirmLabel="OK"
        onConfirm={() => setDialog(null)}
      />
    </ScrollView>
  );
}
