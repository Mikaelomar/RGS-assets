// Ads: AdMob interstitials at natural breaks (frequency-capped, ~10 per hour) and opt-in rewarded ads.
// In the browser a demo ad overlay is shown instead so the flow can be tested.
import { AdMob, InterstitialAdPluginEvents, RewardAdPluginEvents, AdmobConsentStatus } from '@capacitor-community/admob';
import type { Game } from './Game';
import { ADS } from '../data/config';
import { isNative, platform } from '../core/Platform';
import { h, money } from '../core/util';
import { audio } from '../core/Audio';

export type RewardKind = 'cash' | 'energy' | 'rush' | 'bonus';

export class AdManager {
  private sessionStart = performance.now() / 1000;
  private lastInterstitial = -1e9;
  private lastReward = -1e9;
  private interstitialReady = false;
  private rewardReady = false;
  private showing = false;
  private nativeOk = false;
  shownThisSession = 0;

  constructor(private g: Game) {}

  private ids() { return platform === 'ios' ? ADS.ios : ADS.android; }
  private now() { return performance.now() / 1000; }

  async init() {
    if (!ADS.enabled || !isNative) return;
    try {
      await AdMob.initialize({ initializeForTesting: ADS.testing });
      if (platform === 'ios') {
        try {
          const st = await AdMob.trackingAuthorizationStatus();
          if (st.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
        } catch { /* ignore */ }
      }
      try {
        const info = await AdMob.requestConsentInfo();
        if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
      } catch { /* consent not configured: continue with non-personalized */ }
      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => this.prepareInterstitial());
      AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => { this.interstitialReady = false; setTimeout(() => this.prepareInterstitial(), 30000); });
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => this.prepareReward());
      AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => { this.rewardReady = false; setTimeout(() => this.prepareReward(), 30000); });
      this.nativeOk = true;
      this.prepareInterstitial();
      this.prepareReward();
    } catch (e) {
      console.warn('AdMob init failed', e);
    }
  }

  private async prepareInterstitial() {
    if (!this.nativeOk) return;
    try {
      await AdMob.prepareInterstitial({ adId: this.ids().interstitial, isTesting: ADS.testing });
      this.interstitialReady = true;
    } catch { this.interstitialReady = false; }
  }
  private async prepareReward() {
    if (!this.nativeOk) return;
    try {
      await AdMob.prepareRewardVideoAd({ adId: this.ids().rewarded, isTesting: ADS.testing });
      this.rewardReady = true;
    } catch { this.rewardReady = false; }
  }

  async showPrivacyOptions() {
    if (!this.nativeOk) {
      this.g.ui.toast('Privacy options are available in the mobile app.', 'info');
      return;
    }
    try { await AdMob.showPrivacyOptionsForm(); } catch { /* ignore */ }
  }

  /** Whether an interstitial would be allowed right now. */
  canShowInterstitial() {
    if (!ADS.enabled || this.showing) return false;
    const s = this.g.state;
    if (!s.tutorialDone) return false;
    const t = this.now();
    if (t - this.sessionStart < ADS.firstAdAfterSeconds) return false;
    if (t - this.lastInterstitial < ADS.minSecondsBetween) return false;
    return true;
  }

  /** Call at natural breaks (end of day, closing the manager app, level up). */
  async maybeInterstitial(reason: string): Promise<void> {
    if (!this.canShowInterstitial()) return;
    this.showing = true;
    await this.countdown();
    this.lastInterstitial = this.now();
    this.shownThisSession++;
    this.g.setPaused(true, 'ad');
    audio.suspend();
    try {
      if (this.nativeOk && this.interstitialReady) {
        this.interstitialReady = false;
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, finish);
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, finish);
          AdMob.showInterstitial().catch(finish);
          setTimeout(finish, 90000);
        });
      } else if (!isNative) {
        await this.demoAd(false);
      }
    } finally {
      audio.resume();
      this.g.setPaused(false, 'ad');
      this.showing = false;
    }
    void reason;
  }

  private countdown(): Promise<void> {
    return new Promise((resolve) => {
      let n = ADS.countdownSeconds;
      if (n <= 0) return resolve();
      const el = h('div', { class: 'toast info', style: { position: 'absolute', left: '50%', top: '40%', transform: 'translate(-50%,-50%)', zIndex: '60', fontSize: '22px' } }, `Ad break in ${n}…`);
      this.g.ui.root.appendChild(el);
      const iv = setInterval(() => {
        n--;
        if (n <= 0) {
          clearInterval(iv);
          el.remove();
          resolve();
        } else el.textContent = `Ad break in ${n}…`;
      }, 1000);
    });
  }

  /** Browser stand-in so the ad flow is visible while testing. */
  private demoAd(rewarded: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      let t = rewarded ? 6 : 5;
      const timer = h('div', { style: { fontFamily: 'var(--font-display)', fontSize: '20px' } }, `${t}`);
      const closeBtn = h('button', { class: 'btn gray', style: { visibility: 'hidden' } }, rewarded ? 'Claim reward ✓' : 'Close ✕');
      const box = h('div', { class: 'overlay', style: { zIndex: '70', background: 'rgba(5,10,15,.92)', flexDirection: 'column', gap: '14px', color: '#fff', textAlign: 'center' } },
        h('div', { style: { fontSize: '13px', opacity: '.7', letterSpacing: '2px' } }, 'ADVERTISEMENT · DEMO'),
        h('div', { style: { fontFamily: 'var(--font-display)', fontSize: '34px' } }, '🛒 Your ad could be here'),
        h('div', { style: { maxWidth: '520px', fontWeight: '700' } }, rewarded ? 'Watch to the end to get your reward.' : 'Real AdMob ads are shown in the Android / iPhone app.'),
        timer, closeBtn);
      this.g.ui.root.appendChild(box);
      const iv = setInterval(() => {
        t--;
        timer.textContent = t > 0 ? `${t}` : '';
        if (t <= 0) {
          clearInterval(iv);
          closeBtn.style.visibility = 'visible';
        }
      }, 1000);
      closeBtn.addEventListener('click', () => {
        box.remove();
        resolve(true);
      });
    });
  }

  rewardCash() {
    return ADS.rewardCashBase + ADS.rewardCashPerLevel * this.g.state.level;
  }

  /** Opt-in rewarded ad. */
  async rewarded(kind: RewardKind, amount = 0) {
    const g = this.g;
    if (this.showing) return;
    const t = this.now();
    if ((kind === 'cash' || kind === 'energy') && t - this.lastReward < ADS.rewardCooldownSec) {
      g.ui.toast(`Next reward available in ${Math.ceil(ADS.rewardCooldownSec - (t - this.lastReward))} s`, 'info', '⏳');
      return;
    }
    this.showing = true;
    g.setPaused(true, 'ad');
    audio.suspend();
    let ok = false;
    try {
      if (this.nativeOk) {
        if (!this.rewardReady) await this.prepareReward();
        if (this.rewardReady) {
          this.rewardReady = false;
          const item = await AdMob.showRewardVideoAd().catch(() => null);
          ok = !!item;
        } else g.ui.toast('No ad available right now, try again later.', 'info');
      } else if (!isNative) ok = await this.demoAd(true);
    } finally {
      audio.resume();
      g.setPaused(false, 'ad');
      this.showing = false;
    }
    if (!ok) return;
    this.lastReward = this.now();
    // a rewarded ad also counts as an ad break
    this.lastInterstitial = Math.max(this.lastInterstitial, this.now() - ADS.minSecondsBetween * 0.5);
    switch (kind) {
      case 'cash': {
        const v = this.rewardCash();
        g.sim.earn(v, 'reward');
        g.ui.toast(`+${money(v, 0)} reward!`, 'good', '💵');
        break;
      }
      case 'energy':
        g.state.energy = Math.min(100, g.state.energy + ADS.rewardEnergy);
        g.ui.toast(`+${ADS.rewardEnergy} energy!`, 'good', '⚡');
        break;
      case 'rush':
        g.orders.rushAll();
        g.ui.toast('Trucks are on their way right now!', 'good', '🚚');
        break;
      case 'bonus':
        g.sim.earn(amount, 'reward');
        g.ui.toast(`+${money(amount, 0)} bonus!`, 'good', '💵');
        break;
    }
    audio.play('coins');
  }
}
