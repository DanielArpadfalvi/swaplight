import { useState } from 'preact/hooks';
import { getCharm, getRelic, makeGoal, sellValue, type ShopOffer } from '../../core/run';
import type { GameActions, GameUiState } from '../../game/state';
import { t } from '../../i18n';
import { useFormat } from '../format';
import { IconPlay } from '../icons';
import { CharmIcon, RARITY_COLOR, RelicIcon, SparkIcon } from './runIcons';
import { SparkPill } from './RunScreens';
import { charmDesc, charmName, goalText, relicDesc, relicName } from './runText';
import { longestWord } from '../fit';
import { ScrollMore } from '../ScrollMore';
import { useScrollMore } from '../useScrollMore';

interface Props {
  state: GameUiState;
  actions: GameActions;
  leaving: boolean;
}

/** Between stages: 3 relics + 2 charms, reroll, sell owned items, then the next stage. */
export function ShopScreen({ state, actions, leaving }: Props) {
  const fmt = useFormat();
  const run = state.run;
  const [selected, setSelected] = useState<number | null>(null);
  const [bodyRef, more] = useScrollMore<HTMLDivElement>();
  if (!run || !run.shop) return null;
  const shop = run.shop;
  const relicsFull = run.relics.length >= state.runRelicSlots;
  const charmsFull = run.charms.length >= state.runCharmSlots;
  const rerollCost = state.runRerollCost;
  // Offers re-animate on reroll.
  const deal = shop.rerolls * 10 + (shop.freeRerolls > 0 ? 0 : 1);
  const nextIndex = (run.act - 1) * 4 + run.stage + 1;
  const next = run.plan[nextIndex];
  const nextGoal = next ? makeGoal(next.goalType, next.act, next.stage, run.brightness) : null;
  const sel = selected !== null ? run.relics[selected] : undefined;
  return (
    <div class={`overlay sheet run-sheet shop${leaving ? ' is-leaving' : ''}`} data-testid="shop">
      <div class="sheet-frame">
        <header class="shop-head">
          <div class="shop-title-wrap">
            <h2 class="sheet-title shop-title">{t('run.shopTitle')}</h2>
            <span class="shop-sub">
              {t('run.actNumber', { number: run.act })} ·{' '}
              {run.stage === 3 ? t('run.bossShort') : t('run.stageShort', { stage: run.stage + 1 })}
            </span>
          </div>
          <SparkPill value={run.szikra} testId="shop-sparks" />
        </header>
        <div class={`sheet-body shop-body${more ? ' has-more' : ''}`} ref={bodyRef}>
          <section class="shop-section">
            <h3 class="section-title">{t('run.relics')}</h3>
            <div class="offer-row offer-row-3" key={`r${deal}`}>
              {shop.relics.map((o, i) => (
                <OfferCard
                  key={`${o.id}-${i}`}
                  index={i}
                  offer={o}
                  kind="relic"
                  afford={run.szikra >= o.price}
                  full={relicsFull}
                  onBuy={() => actions.run.buyRelic(i)}
                />
              ))}
            </div>
          </section>
          <section class="shop-section">
            <h3 class="section-title">{t('run.charms')}</h3>
            <div class="offer-row offer-row-2" key={`c${deal}`}>
              {shop.charms.map((o, i) => (
                <OfferCard
                  key={`${o.id}-${i}`}
                  index={i + 3}
                  offer={o}
                  kind="charm"
                  afford={run.szikra >= o.price}
                  full={charmsFull}
                  onBuy={() => actions.run.buyCharm(i)}
                />
              ))}
            </div>
          </section>
          <button
            type="button"
            class="btn btn-ghost reroll-btn"
            data-testid="shop-reroll"
            disabled={run.szikra < rerollCost}
            onClick={() => actions.run.reroll()}
          >
            <RerollGlyph />
            {rerollCost === 0 ? (
              t('run.freeReroll')
            ) : (
              <>
                {t('run.reroll')}
                <span class="price-tag">
                  <SparkIcon size={13} />
                  {rerollCost}
                </span>
              </>
            )}
          </button>
          <section class="shop-section owned">
            <h3 class="section-title">
              {t('run.owned')} · <span class="run-muted">{t('run.tapToSell')}</span>
            </h3>
            <div class="owned-row">
              <div class="loadout-row">
                {Array.from(
                  { length: Math.max(state.runRelicSlots, run.relics.length) },
                  (_, i) => {
                    const r = run.relics[i];
                    if (!r) return <span key={i} class="slot-empty slot-hex" />;
                    return (
                      <button
                        type="button"
                        key={`${r.id}-${i}`}
                        class={`owned-relic${selected === i ? ' is-selected' : ''}`}
                        data-testid={`owned-relic-${i}`}
                        aria-label={relicName(r.id)}
                        onClick={() => setSelected(selected === i ? null : i)}
                      >
                        <RelicIcon id={r.id} rarity={getRelic(r.id).rarity} size={38} />
                      </button>
                    );
                  },
                )}
              </div>
              <div class="loadout-row">
                {Array.from(
                  { length: Math.max(state.runCharmSlots, run.charms.length) },
                  (_, i) => {
                    const c = run.charms[i];
                    if (!c) return <span key={i} class="slot-empty slot-round" />;
                    return (
                      <button
                        type="button"
                        key={`${c.id}-${i}`}
                        class="owned-charm"
                        data-testid={`owned-charm-${i}`}
                        aria-label={charmName(c.id)}
                        onClick={() => {
                          setSelected(null);
                          actions.run.openCharm(i);
                        }}
                      >
                        <CharmIcon id={c.id} size={38} />
                      </button>
                    );
                  },
                )}
              </div>
            </div>
            {sel && selected !== null && (
              <div class="sell-bar" data-testid="sell-bar">
                <div class="sell-text">
                  <strong>{relicName(sel.id)}</strong>
                  <span>{relicDesc(sel.id)}</span>
                </div>
                <button
                  type="button"
                  class="btn btn-ghost btn-small sell-btn"
                  data-testid="sell-relic"
                  onClick={() => {
                    actions.run.sellRelic(selected);
                    setSelected(null);
                  }}
                >
                  {t('run.sell')}
                  <span class="price-tag">
                    +<SparkIcon size={12} />
                    {sellValue(sel.paid)}
                  </span>
                </button>
              </div>
            )}
          </section>
        </div>
        <footer class="run-foot">
          <ScrollMore show={more} />
          {nextGoal && next && (
            <div class="next-preview">
              <span class="run-muted">{t('run.upNext')}:</span>{' '}
              {next.stage === 3
                ? t('run.bossTitle', { act: next.act })
                : t('run.stageTitle', { act: next.act, stage: next.stage + 1 })}{' '}
              — {goalText(nextGoal, fmt)}
            </div>
          )}
          <button
            type="button"
            class="btn btn-primary btn-play"
            data-testid="shop-next"
            onClick={() => actions.run.leaveShop()}
          >
            <IconPlay size={20} />
            {t('run.nextStage')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function RerollGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M4.5 11a7.5 7.5 0 0 1 13.4-4.2M19.5 13a7.5 7.5 0 0 1-13.4 4.2M18.5 3v4h-4M5.5 21v-4h4" />
    </svg>
  );
}

function OfferCard({
  offer,
  kind,
  index,
  afford,
  full,
  onBuy,
}: {
  offer: ShopOffer;
  kind: 'relic' | 'charm';
  index: number;
  afford: boolean;
  full: boolean;
  onBuy: () => void;
}) {
  const rarity = kind === 'relic' ? getRelic(offer.id).rarity : getCharm(offer.id).rarity;
  const name = kind === 'relic' ? relicName(offer.id) : charmName(offer.id);
  const desc = kind === 'relic' ? relicDesc(offer.id) : charmDesc(offer.id);
  const disabled = offer.sold || !afford || full;
  return (
    <div
      class={`offer-card offer-${kind} rarity-${rarity}${offer.sold ? ' is-sold' : ''}`}
      style={{ animationDelay: `${80 + index * 90}ms`, '--rarity': RARITY_COLOR[rarity] }}
      data-testid={`offer-${kind}-${index - (kind === 'charm' ? 3 : 0)}`}
    >
      <span class="offer-rarity">{t(`run.rarity.${rarity}`)}</span>
      <span class="offer-icon">
        {kind === 'relic' ? (
          <RelicIcon id={offer.id} rarity={rarity} size={50} />
        ) : (
          <CharmIcon id={offer.id} size={46} />
        )}
      </span>
      <span class="offer-name" style={{ '--word': String(longestWord(name)) }}>
        {name}
      </span>
      <span class="offer-desc">{desc}</span>
      <button
        type="button"
        class={`offer-buy${!afford && !offer.sold ? ' is-poor' : ''}`}
        disabled={disabled}
        data-testid={`buy-${kind}-${index - (kind === 'charm' ? 3 : 0)}`}
        title={full ? t('run.slotsFull') : !afford ? t('run.notEnoughSparks') : undefined}
        onClick={onBuy}
      >
        {offer.sold ? (
          t('run.soldOut')
        ) : (
          <>
            <SparkIcon size={13} />
            {offer.price}
          </>
        )}
      </button>
    </div>
  );
}
