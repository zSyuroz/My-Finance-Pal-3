import { useMemo, useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import AppText from './AppText';
import { useTheme } from '../ThemeContext';
import { radius, type Theme } from '../theme';
import type { CropBox, PickedImage } from '../pickAvatar';

/** The framing window, in points. Everything else is derived from it. */
const VIEWPORT = 260;
const MAX_ZOOM = 4;

/**
 * Frames a picture for the avatar: drag to move, buttons to zoom, circle to
 * show what will survive.
 *
 * The operating system's own crop screen only exists on a phone, so on the web
 * a picture was taken whole and centre-cropped by the renderer — you got
 * whatever happened to be in the middle. This does the framing in the app, the
 * same way on every platform, and hands back the square in the source image's
 * own pixels for the cropper to cut.
 */
export default function AvatarCropper({
  image,
  onCancel,
  onDone,
}: {
  image: PickedImage | null;
  onCancel: () => void;
  onDone: (box: CropBox) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  // The offset when the current drag began; state lags a gesture by a frame.
  const start = useRef({ x: 0, y: 0 });
  // Read inside the responder, which closes over its first render otherwise.
  const live = useRef({ zoom: 1, offset: { x: 0, y: 0 }, image });
  live.current = { zoom, offset, image };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = live.current.offset;
      },
      onPanResponderMove: (_, g) => {
        const { image: img, zoom: z } = live.current;
        if (!img) return;
        setOffset(
          clampOffset(
            { x: start.current.x + g.dx, y: start.current.y + g.dy },
            fit(img, z)
          )
        );
      },
    })
  ).current;

  if (!image) return null;

  const { displayW, displayH } = fit(image, zoom);

  const setZoomKeepingCentre = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, Number(next.toFixed(2))));
    const before = fit(image, zoom);
    const after = fit(image, z);
    // Grow about the middle of the window rather than the top-left corner, so
    // zooming does not walk the subject out of frame.
    const centreX = VIEWPORT / 2 - offset.x;
    const centreY = VIEWPORT / 2 - offset.y;
    const ratio = after.displayW / before.displayW;
    setZoom(z);
    setOffset(
      clampOffset({ x: VIEWPORT / 2 - centreX * ratio, y: VIEWPORT / 2 - centreY * ratio }, after)
    );
  };

  const done = () => {
    const { displayW: w } = fit(image, zoom);
    // Display points back to source pixels.
    const perPoint = image.width / w;
    onDone({
      originX: -offset.x * perPoint,
      originY: -offset.y * perPoint,
      size: VIEWPORT * perPoint,
    });
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <AppText variant="bodySemi" style={styles.title}>
            Frame your picture
          </AppText>
          <AppText variant="mono" muted style={styles.hint}>
            Drag to move it. What sits inside the circle is what people see.
          </AppText>

          <View style={styles.stage}>
            <View style={styles.viewport} {...pan.panHandlers}>
              <Image
                source={{ uri: image.uri }}
                style={{
                  position: 'absolute',
                  left: offset.x,
                  top: offset.y,
                  width: displayW,
                  height: displayH,
                }}
                resizeMode="cover"
              />
            </View>
            {/* Drawn over the picture rather than around it, so the edge of
                the keep-area is exact and nothing is hidden behind a frame. */}
            <View pointerEvents="none" style={styles.ring} />
          </View>

          <View style={styles.zoomRow}>
            <Pressable
              onPress={() => setZoomKeepingCentre(zoom - 0.25)}
              disabled={zoom <= 1}
              style={[styles.zoomBtn, zoom <= 1 && styles.zoomBtnOff]}
              accessibilityLabel="Zoom out"
            >
              <AppText variant="bodySemi" color={colors.iris}>
                −
              </AppText>
            </Pressable>
            <View style={styles.track}>
              <View
                style={[
                  styles.trackFill,
                  { width: `${((zoom - 1) / (MAX_ZOOM - 1)) * 100}%` },
                ]}
              />
            </View>
            <Pressable
              onPress={() => setZoomKeepingCentre(zoom + 0.25)}
              disabled={zoom >= MAX_ZOOM}
              style={[styles.zoomBtn, zoom >= MAX_ZOOM && styles.zoomBtnOff]}
              accessibilityLabel="Zoom in"
            >
              <AppText variant="bodySemi" color={colors.iris}>
                +
              </AppText>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <AppText variant="bodySemi">Cancel</AppText>
            </Pressable>
            <Pressable style={styles.useBtn} onPress={done}>
              <AppText variant="bodySemi" color={colors.onAction}>
                Use photo
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** The picture's size on screen at this zoom — always covering the window. */
function fit(image: PickedImage, zoom: number) {
  const base = VIEWPORT / Math.min(image.width, image.height);
  return { displayW: image.width * base * zoom, displayH: image.height * base * zoom };
}

/** Keeps the window full: the picture may never be dragged off its own edge. */
function clampOffset(
  o: { x: number; y: number },
  size: { displayW: number; displayH: number }
) {
  return {
    x: Math.min(0, Math.max(VIEWPORT - size.displayW, o.x)),
    y: Math.min(0, Math.max(VIEWPORT - size.displayH, o.y)),
  };
}

function makeStyles(c: Theme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.7)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: c.mist,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: c.line,
      padding: 20,
    },
    title: { fontSize: 17 },
    hint: { marginTop: 6, fontSize: 11, lineHeight: 16 },
    stage: { alignSelf: 'center', marginTop: 18 },
    viewport: {
      width: VIEWPORT,
      height: VIEWPORT,
      borderRadius: VIEWPORT / 2,
      overflow: 'hidden',
      backgroundColor: c.haze,
    },
    ring: {
      position: 'absolute',
      left: 0,
      top: 0,
      width: VIEWPORT,
      height: VIEWPORT,
      borderRadius: VIEWPORT / 2,
      borderWidth: 2,
      borderColor: c.action,
    },
    zoomRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
    zoomBtn: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: c.haze,
      borderWidth: 1,
      borderColor: c.line,
      alignItems: 'center',
      justifyContent: 'center',
    },
    zoomBtnOff: { opacity: 0.4 },
    track: { flex: 1, height: 4, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' },
    trackFill: { height: 4, borderRadius: 4, backgroundColor: c.action },
    actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
    cancelBtn: {
      flex: 1,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: c.haze,
      alignItems: 'center',
      justifyContent: 'center',
    },
    useBtn: {
      flex: 1,
      height: 48,
      borderRadius: radius.md,
      backgroundColor: c.action,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
