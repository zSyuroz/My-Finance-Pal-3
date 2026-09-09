import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppText from '../components/AppText';
import Avatar from '../components/Avatar';
import AvatarCropper from '../components/AvatarCropper';
import ConfirmDialog from '../components/ConfirmDialog';
import DayOfMonthGrid from '../components/DayOfMonthGrid';
import OrbitHero from '../components/OrbitHero';
import PaydayFields from '../components/PaydayFields';
import {
  applyDueIncome,
  applyDueRecurring,
  markOnboardingComplete,
  setBudget,
  setEverydayAccount,
  setSavingsPerCycle,
  setProfile,
  uid,
  upsertAccount,
  upsertGoal,
  upsertRecurring,
  upsertRecurringIncome,
} from '../db';
import { todayKey } from '../dateUtils';
import { cropToAvatar, pickImage, type PickedImage } from '../pickAvatar';
import { CATEGORIES } from '../spending';
import { currencyPrefix } from '../currency';
import { useTheme } from '../ThemeContext';
import { radius, shadow, type Theme } from '../theme';

/** Strips anything that is not part of a number, then makes it positive. */
const money = (v: string) => Math.abs(Number(v.replace(/[^0-9.]/g, '')) || 0);

export default function OnboardingScreen({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // A step counter rather than a stack: onboarding is mounted by the app root,
  // outside any navigator, so keeping the flow self-contained avoids adding a
  // navigator that exists for first run alone.
  const [step, setStep] = useState(0);

  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  // The picture waiting to be framed; nothing is kept until the frame is set.
  const [framing, setFraming] = useState<PickedImage | null>(null);

  const [payAmount, setPayAmount] = useState('');
  const [payDay, setPayDay] = useState<number | null>(null);

  const [bankName, setBankName] = useState('');
  const [bankBalance, setBankBalance] = useState('');

  // Each of these steps collects a list, not a single answer: nobody has
  // exactly one bill, one budget or one goal, and a first run that takes the
  // first and moves on quietly loses the rest. The draft fields are what is
  // being typed; the array is what has been added.
  const [billLabel, setBillLabel] = useState('');
  const [billAmount, setBillAmount] = useState('');
  const [billDay, setBillDay] = useState<number | null>(null);
  const [bills, setBills] = useState<{ label: string; amount: number; day: number }[]>([]);

  const [budgetCategory, setBudgetCategory] = useState('food');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgets, setBudgets] = useState<{ category: string; amount: number }[]>([]);

  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goals, setGoals] = useState<{ name: string; target: number }[]>([]);
  const [savePerCycle, setSavePerCycle] = useState('');

  const billDraft =
    billLabel.trim() !== '' && money(billAmount) > 0 && billDay != null
      ? { label: billLabel.trim(), amount: money(billAmount), day: billDay }
      : null;
  const budgetDraft =
    money(budgetAmount) > 0 ? { category: budgetCategory, amount: money(budgetAmount) } : null;
  const goalDraft =
    goalName.trim() !== '' && money(goalTarget) > 0
      ? { name: goalName.trim(), target: money(goalTarget) }
      : null;

  const addBill = () => {
    if (!billDraft) return;
    setBills((list) => [...list, billDraft]);
    setBillLabel('');
    setBillAmount('');
    setBillDay(null);
  };

  const addBudget = () => {
    if (!budgetDraft) return;
    // One limit per category, so naming the same one twice replaces it rather
    // than leaving two rows that cannot both be true.
    setBudgets((list) => [...list.filter((b) => b.category !== budgetDraft.category), budgetDraft]);
    setBudgetAmount('');
  };

  const addGoal = () => {
    if (!goalDraft) return;
    setGoals((list) => [...list, goalDraft]);
    setGoalName('');
    setGoalTarget('');
  };

  const choosePicture = async () => {
    try {
      const picked = await pickImage();
      if (picked) setFraming(picked);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : 'Could not open your photos.');
    }
  };

  /**
   * Every step in one table.
   *
   * `save` runs on the way past rather than all at the end, so a step already
   * filled in survives the app being closed on a later one — and each is
   * independently skippable, because a first run that demands six answers
   * before showing anything is a first run people abandon.
   */
  const steps: {
    key: string;
    ready: boolean;
    save: () => Promise<void>;
    body: ReactNode;
  }[] = [
    {
      key: 'profile',
      ready: name.trim() !== '' || avatar != null,
      save: async () => {
        await setProfile({ name, avatar });
      },
      body: (
        <>
          <Pressable style={styles.avatarWrap} onPress={choosePicture}>
            <Avatar name={name} uri={avatar} size={112} />
            <View style={styles.avatarBadge}>
              <AppText variant="bodySemi" color={colors.onAction} style={styles.avatarBadgeText}>
                {avatar ? '✎' : '+'}
              </AppText>
            </View>
          </Pressable>

          <AppText variant="displaySm" center style={styles.title}>
            Hello — who are you?
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            Just for this device. Everything here is optional — skip anything and set it later in
            Settings.
          </AppText>

          <View style={styles.form}>
            <AppText variant="label" muted style={styles.fieldLabel}>
              Your name
            </AppText>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              autoFocus
              returnKeyType="done"
            />
          </View>
        </>
      ),
    },

    {
      key: 'income',
      // Both halves are needed: an amount with no day never posts, and a day
      // with no amount posts nothing.
      ready: payAmount.trim() !== '' && payDay != null,
      save: async () => {
        if (payDay == null || money(payAmount) <= 0) return;
        await upsertRecurringIncome({
          id: uid(),
          amount: money(payAmount),
          source: 'Salary',
          category: 'salary',
          dayOfMonth: payDay,
          active: 1,
          createdAt: Date.now(),
        });
        // Records this month's pay immediately if the day has already gone by,
        // so the app opens with money in it rather than an empty first cycle.
        await applyDueIncome();
      },
      body: (
        <>
          <View style={styles.hero}>
            <OrbitHero size={112} />
          </View>
          <AppText variant="displaySm" center style={styles.title}>
            When are you paid?
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            It gets recorded for you every month, and your spending cycle turns on the same day.
          </AppText>
          <View style={styles.form}>
            <PaydayFields
              amount={payAmount}
              day={payDay}
              onChangeAmount={setPayAmount}
              onChangeDay={setPayDay}
              compact
            />
          </View>
        </>
      ),
    },

    {
      key: 'account',
      ready: bankName.trim() !== '' && bankBalance.trim() !== '',
      save: async () => {
        if (bankName.trim() === '') return;
        const id = uid();
        await upsertAccount({
          id,
          name: bankName.trim(),
          kind: 'bank',
          balance: money(bankBalance),
          note: '',
          apr: 0,
          minPayment: 0,
          balanceAsOf: todayKey(),
          isEveryday: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        // The first account is the one you spend from, so what you log moves a
        // real balance instead of sitting beside a number that never changes.
        await setEverydayAccount(id);
      },
      body: (
        <>
          <AppText variant="displaySm" center style={styles.title}>
            What do you bank with?
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            This becomes your net worth, and what you log adjusts it as you go.
          </AppText>
          <View style={styles.form}>
            <AppText variant="label" muted style={styles.fieldLabel}>
              Account name
            </AppText>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="DBS savings"
              placeholderTextColor={colors.textMuted}
            />
            <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
              What it holds today
            </AppText>
            <TextInput
              style={styles.input}
              value={bankBalance}
              onChangeText={setBankBalance}
              keyboardType="decimal-pad"
              placeholder={`${currencyPrefix()}0.00`}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </>
      ),
    },

    {
      key: 'bill',
      ready: bills.length > 0 || billDraft != null,
      save: async () => {
        // The draft counts even if Add was never pressed: filling a form and
        // pressing Continue plainly means "keep this".
        const all = billDraft ? [...bills, billDraft] : bills;
        for (const b of all) {
          await upsertRecurring({
            id: uid(),
            amount: b.amount,
            category: 'bills',
            label: b.label,
            dayOfMonth: b.day,
            active: 1,
            createdAt: Date.now(),
          });
        }
        if (all.length > 0) await applyDueRecurring();
      },
      body: (
        <>
          <AppText variant="displaySm" center style={styles.title}>
            Any bill you pay monthly?
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            Rent, a subscription, the gym. It records itself each month, and is set aside from what
            you can spend.
          </AppText>
          <View style={styles.form}>
            <AppText variant="label" muted style={styles.fieldLabel}>
              What for
            </AppText>
            <TextInput
              style={styles.input}
              value={billLabel}
              onChangeText={setBillLabel}
              placeholder="Rent"
              placeholderTextColor={colors.textMuted}
            />
            <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
              Amount
            </AppText>
            <TextInput
              style={styles.input}
              value={billAmount}
              onChangeText={setBillAmount}
              keyboardType="decimal-pad"
              placeholder={`${currencyPrefix()}0.00`}
              placeholderTextColor={colors.textMuted}
            />
            <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
              Due on
            </AppText>
            <DayOfMonthGrid day={billDay} onChange={setBillDay} activeColor={colors.iris} compact />

            <Pressable
              style={[styles.addBtn, !billDraft && styles.addBtnOff]}
              disabled={!billDraft}
              onPress={addBill}
            >
              <AppText variant="bodySemi" color={billDraft ? colors.iris : colors.textMuted}>
                + Add another
              </AppText>
            </Pressable>
          </View>

          <AddedList
            items={bills.map((b) => ({
              key: b.label + b.day,
              label: b.label,
              detail: `${currencyPrefix()}${b.amount.toLocaleString()} · the ${b.day}${ordinalSuffix(b.day)}`,
            }))}
            onRemove={(i) => setBills((list) => list.filter((_, n) => n !== i))}
            styles={styles}
            colors={colors}
          />
        </>
      ),
    },

    {
      key: 'budget',
      ready: budgets.length > 0 || budgetDraft != null,
      save: async () => {
        const all = budgetDraft
          ? [...budgets.filter((b) => b.category !== budgetDraft.category), budgetDraft]
          : budgets;
        for (const b of all) await setBudget(b.category, b.amount);
      },
      body: (
        <>
          <AppText variant="displaySm" center style={styles.title}>
            Want a spending limit?
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            One category to keep an eye on. Home shows how far through it you are, at a glance.
          </AppText>
          <View style={styles.form}>
            <AppText variant="label" muted style={styles.fieldLabel}>
              On what
            </AppText>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setBudgetCategory(c.key)}
                  style={[styles.chip, budgetCategory === c.key && { borderColor: c.color }]}
                >
                  <View style={[styles.chipDot, { backgroundColor: c.color }]} />
                  <AppText variant={budgetCategory === c.key ? 'bodySemi' : 'body'}>
                    {c.label}
                  </AppText>
                </Pressable>
              ))}
            </View>
            <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
              Limit each cycle
            </AppText>
            <TextInput
              style={styles.input}
              value={budgetAmount}
              onChangeText={setBudgetAmount}
              keyboardType="decimal-pad"
              placeholder={`${currencyPrefix()}0.00`}
              placeholderTextColor={colors.textMuted}
            />

            <Pressable
              style={[styles.addBtn, !budgetDraft && styles.addBtnOff]}
              disabled={!budgetDraft}
              onPress={addBudget}
            >
              <AppText variant="bodySemi" color={budgetDraft ? colors.iris : colors.textMuted}>
                + Add another
              </AppText>
            </Pressable>
          </View>

          <AddedList
            items={budgets.map((b) => ({
              key: b.category,
              label: CATEGORIES.find((c) => c.key === b.category)?.label ?? b.category,
              detail: `${currencyPrefix()}${b.amount.toLocaleString()} a cycle`,
            }))}
            onRemove={(i) => setBudgets((list) => list.filter((_, n) => n !== i))}
            styles={styles}
            colors={colors}
          />
        </>
      ),
    },

    {
      key: 'goal',
      ready: goals.length > 0 || goalDraft != null || money(savePerCycle) > 0,
      save: async () => {
        const all = goalDraft ? [...goals, goalDraft] : goals;
        for (const g of all) {
          await upsertGoal({
            id: uid(),
            name: g.name,
            target: g.target,
            saved: 0,
            dueDate: null,
            createdAt: Date.now(),
          });
        }
        if (money(savePerCycle) > 0) await setSavingsPerCycle(money(savePerCycle));
      },
      body: (
        <>
          <AppText variant="displaySm" center style={styles.title}>
            Saving for anything?
          </AppText>
          <AppText variant="body" muted center style={styles.subtitle}>
            A trip, a deposit, a rainy day — and how much you set aside for them.
          </AppText>
          <View style={styles.form}>
            <AppText variant="label" muted style={styles.fieldLabel}>
              What for
            </AppText>
            <TextInput
              style={styles.input}
              value={goalName}
              onChangeText={setGoalName}
              placeholder="Emergency fund"
              placeholderTextColor={colors.textMuted}
            />
            <AppText variant="label" muted style={[styles.fieldLabel, styles.spaced]}>
              Target
            </AppText>
            <TextInput
              style={styles.input}
              value={goalTarget}
              onChangeText={setGoalTarget}
              keyboardType="decimal-pad"
              placeholder={`${currencyPrefix()}0.00`}
              placeholderTextColor={colors.textMuted}
            />

            <Pressable
              style={[styles.addBtn, !goalDraft && styles.addBtnOff]}
              disabled={!goalDraft}
              onPress={addGoal}
            >
              <AppText variant="bodySemi" color={goalDraft ? colors.iris : colors.textMuted}>
                + Add another
              </AppText>
            </Pressable>
          </View>

          <AddedList
            items={goals.map((g, i) => ({
              key: g.name + i,
              label: g.name,
              detail: `${currencyPrefix()}${g.target.toLocaleString()}`,
            }))}
            onRemove={(i) => setGoals((list) => list.filter((_, n) => n !== i))}
            styles={styles}
            colors={colors}
          />

          <View style={[styles.form, styles.formSpaced]}>
            <AppText variant="label" muted style={styles.fieldLabel}>
              Saving each cycle
            </AppText>
            <TextInput
              style={styles.input}
              value={savePerCycle}
              onChangeText={setSavePerCycle}
              keyboardType="decimal-pad"
              placeholder={`${currencyPrefix()}0.00`}
              placeholderTextColor={colors.textMuted}
            />
            <AppText variant="mono" muted style={styles.hint}>
              Shared across your goals at the end of each cycle.
            </AppText>
          </View>
        </>
      ),
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  /**
   * Held while a step is saving, so a second press cannot start a second save.
   *
   * Each step writes a brand new record with a fresh id, and the button stayed
   * live across the await — so two taps on Continue, or one tap the app was
   * slow to acknowledge, wrote the record twice. That is how a single salary
   * became two identical rules and the app started planning around double the
   * income. A ref rather than state because it has to be true on the very next
   * press, not after a re-render.
   */
  const saving = useRef(false);

  const advance = async (save: boolean) => {
    if (saving.current) return;
    saving.current = true;
    try {
      // A failed write must not strand someone on the first screen they ever
      // see: every step is theirs to skip, so a broken save behaves like a skip.
      if (save) {
        try {
          await current.save();
        } catch {
          // Left for the app proper to report; onboarding keeps moving.
        }
      }
      if (isLast) {
        await markOnboardingComplete();
        onDone();
        return;
      }
      setStep(step + 1);
    } finally {
      saving.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          // The layout is sized to fit on one screen without scrolling on
          // typical phones — this only kicks in as a fallback (a very small
          // device, or larger accessibility font sizes).
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.step}>{current.body}</View>
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.progress}>
            {/* Dots alone say "there is more" but not how much. Naming the step
                turns an ambiguous indicator into an actual answer. */}
            <View style={styles.dots}>
              {steps.map((s, i) => (
                <View
                  key={s.key}
                  style={[
                    styles.dot,
                    i === step ? styles.dotActive : null,
                    { backgroundColor: i === step ? colors.gold : colors.line },
                  ]}
                />
              ))}
            </View>
            <AppText variant="mono" muted style={styles.progressLabel}>
              Step {step + 1} of {steps.length}
            </AppText>
          </View>

          <Pressable
            style={[styles.primaryBtn, !current.ready && styles.primaryBtnDisabled]}
            disabled={!current.ready}
            onPress={() => advance(true)}
          >
            <AppText variant="bodySemi" color={current.ready ? colors.onGold : colors.textMuted}>
              {isLast ? 'Finish' : 'Continue'}
            </AppText>
          </Pressable>
          <Pressable style={styles.skipBtn} onPress={() => advance(false)}>
            <AppText variant="bodySemi" muted>
              {isLast ? 'Skip and finish' : 'Skip for now'}
            </AppText>
          </Pressable>
        </View>

        <ConfirmDialog
          visible={!!pickError}
          title="Couldn't use that picture"
          message={pickError ?? ''}
          confirmLabel="OK"
          onConfirm={() => setPickError(null)}
        />

        <AvatarCropper
          image={framing}
          onCancel={() => setFraming(null)}
          onDone={async (box) => {
            const source = framing;
            setFraming(null);
            if (!source) return;
            try {
              setAvatar(await cropToAvatar(source, box));
            } catch {
              setPickError('That picture could not be saved. Try another one.');
            }
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * What has been added so far on a step that collects several.
 *
 * Shown under the form rather than inside it, so the fields stay in the same
 * place while the list grows beneath them.
 */
function AddedList({
  items,
  onRemove,
  styles,
  colors,
}: {
  items: { key: string; label: string; detail: string }[];
  onRemove: (index: number) => void;
  styles: ReturnType<typeof makeStyles>;
  colors: Theme;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.added}>
      {items.map((item, i) => (
        <View key={item.key} style={styles.addedRow}>
          <View style={styles.addedText}>
            <AppText variant="bodySemi">{item.label}</AppText>
            <AppText variant="mono" muted style={styles.addedDetail}>
              {item.detail}
            </AppText>
          </View>
          <Pressable
            onPress={() => onRemove(i)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.label}`}
          >
            <AppText variant="bodySemi" color={colors.textMuted}>
              ×
            </AppText>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** "1st", "2nd", "3rd" — the day a bill falls on reads better than a number. */
function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.haze },
    flex: { flex: 1 },
    // Centred rather than top-aligned: with only a heading and one field, a
    // top-hugging layout leaves a large dead area beneath and reads as
    // unfinished. flexGrow keeps it scrollable if the keyboard or a large
    // accessibility font makes the block taller than the screen.
    content: {
      paddingHorizontal: 24,
      paddingVertical: 24,
      flexGrow: 1,
      justifyContent: 'center',
    },
    // Every step shares one skeleton — visual, title, subtitle, card — so
    // moving between them feels like one flow rather than six screens.
    step: { alignItems: 'stretch' },
    hero: { alignItems: 'center', marginBottom: 20 },
    title: { marginBottom: 10 },
    // Capped so the sentence breaks into comfortable lines instead of running
    // the full width of a large phone.
    subtitle: { marginBottom: 24, paddingHorizontal: 8, maxWidth: 340, alignSelf: 'center' },
    form: {
      backgroundColor: c.mist,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.line,
      padding: 18,
      ...shadow.card,
    },
    footer: {
      paddingHorizontal: 24,
      paddingTop: 12,
      paddingBottom: 8,
      gap: 8,
    },
    primaryBtn: {
      height: 52,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // A translucent gold button reads as broken and drops the label's contrast
    // well below legible. A flat muted surface says "not yet" while staying
    // readable.
    primaryBtnDisabled: { backgroundColor: c.mist, borderWidth: 1, borderColor: c.line },
    // 48pt clears the 44pt minimum touch target on its own, without relying on
    // hitSlop that nothing visually indicates.
    skipBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
    progress: { alignItems: 'center', marginBottom: 16, gap: 8 },
    progressLabel: { fontSize: 12 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    // The current step is a stadium, not a dot — position is readable at a
    // glance without counting.
    dotActive: { width: 20 },
    avatarWrap: { alignSelf: 'center', marginBottom: 20 },
    avatarBadge: {
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: c.haze,
    },
    avatarBadgeText: { fontSize: 16, lineHeight: 20 },
    // Left-aligned to match the cards' fields: the page is centred, the form's
    // contents are not — centred labels are harder to scan.
    fieldLabel: { marginBottom: 10, marginLeft: 2 },
    spaced: { marginTop: 16 },
    input: {
      backgroundColor: c.haze,
      borderRadius: radius.md,
      paddingHorizontal: 16,
      height: 52,
      color: c.text,
      fontFamily: 'Archivo_400Regular',
      fontSize: 16,
    },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.haze,
      borderRadius: radius.pill,
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    chipDot: { width: 8, height: 8, borderRadius: 4 },
    formSpaced: { marginTop: 14 },
    hint: { marginTop: 10, fontSize: 11, lineHeight: 16 },
    addBtn: {
      height: 44,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 16,
    },
    addBtnOff: { opacity: 0.45 },
    added: { marginTop: 14, gap: 8 },
    addedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.mist,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.line,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    addedText: { flex: 1 },
    addedDetail: { marginTop: 2, fontSize: 11 },
  });
}
