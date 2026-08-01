import type { CanvasOverlayState, Rectangle } from '../types';
import type { MoshEffectCard } from './types';

export const CARD_DRAG_ACTIVATION_PX = 6;

export function dragActivationReached(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold = CARD_DRAG_ACTIVATION_PX,
): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= threshold;
}

export function isCardDragBlockedTarget(target: EventTarget | null): boolean {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return false;
  return Boolean(
    element.closest(
      'button, input, select, textarea, label, [contenteditable="true"], [data-no-card-drag]',
    ),
  );
}

export function setMoshRegion(
  rack: MoshEffectCard[],
  ownerEffectInstanceId: string,
  type: 'source' | 'destination',
  bounds: Rectangle | null,
): MoshEffectCard[] {
  return rack.map((card) => {
    if (card.instanceId !== ownerEffectInstanceId || card.effectId !== 'motion-transfer') {
      return card;
    }
    return type === 'source'
      ? { ...card, sourceRegion: bounds ? { ...bounds } : null }
      : { ...card, destinationRegion: bounds ? { ...bounds } : null };
  });
}

export function clearMoshRegions(
  rack: MoshEffectCard[],
  ownerEffectInstanceId?: string,
  type: 'source' | 'destination' | 'both' = 'both',
): MoshEffectCard[] {
  return rack.map((card) => {
    if (
      card.effectId !== 'motion-transfer' ||
      (ownerEffectInstanceId && card.instanceId !== ownerEffectInstanceId)
    ) {
      return card;
    }
    return {
      ...card,
      sourceRegion: type === 'destination' ? card.sourceRegion : null,
      destinationRegion: type === 'source' ? card.destinationRegion : null,
    };
  });
}

export function deriveMoshOverlays(
  rack: MoshEffectCard[],
  draft?: {
    ownerEffectInstanceId: string;
    type: 'source' | 'destination';
    bounds: Rectangle;
  } | null,
): CanvasOverlayState[] {
  const overlays: CanvasOverlayState[] = [];
  for (const card of rack) {
    if (!card.enabled || card.effectId !== 'motion-transfer') continue;
    if (card.sourceRegion) {
      overlays.push({
        ownerEffectInstanceId: card.instanceId,
        type: 'source-region',
        bounds: { ...card.sourceRegion },
        active: true,
      });
    }
    if (card.destinationRegion) {
      overlays.push({
        ownerEffectInstanceId: card.instanceId,
        type: 'destination-region',
        bounds: { ...card.destinationRegion },
        active: true,
      });
    }
  }
  if (
    draft &&
    rack.some(
      (card) =>
        card.enabled &&
        card.effectId === 'motion-transfer' &&
        card.instanceId === draft.ownerEffectInstanceId,
    )
  ) {
    const draftType = draft.type === 'source' ? 'source-region' : 'destination-region';
    const existingIndex = overlays.findIndex(
      (overlay) =>
        overlay.ownerEffectInstanceId === draft.ownerEffectInstanceId && overlay.type === draftType,
    );
    const overlay: CanvasOverlayState = {
      ownerEffectInstanceId: draft.ownerEffectInstanceId,
      type: draftType,
      bounds: { ...draft.bounds },
      active: true,
    };
    if (existingIndex >= 0) overlays[existingIndex] = overlay;
    else overlays.push(overlay);
  }
  return overlays;
}

export function isMoshRackReady(rack: MoshEffectCard[]): boolean {
  const enabled = rack.filter((card) => card.enabled);
  return (
    enabled.length > 0 &&
    enabled.every((card) => card.effectId !== 'motion-transfer' || Boolean(card.sourceRegion))
  );
}
