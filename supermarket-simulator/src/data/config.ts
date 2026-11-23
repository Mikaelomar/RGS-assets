// Game balance and monetization settings. Tweak numbers here.

export const CONFIG = {
  /** Game minutes per real second while the store is open (≈10 real minutes per business day). */
  minutesPerSecond: 1.45,
  /** Faster clock after closing time. */
  nightMinutesPerSecond: 3.5,
  /** Player energy */
  energyDrainPerMin: 0.05,
  energyRunDrain: 0.12,
  energyCarryDrain: 0.04,
  /** Monthly-ish fixed costs (paid daily) */
  rentPerPlot: 9,
  rentPerRoom: 5,
  insurancePerDay: 4,
  electricityPrice: 0.22,
  waterPerCustomer: 0.015,
  /** Corporate tax paid every 7 days on positive weekly profit */
  taxRate: 0.2,
  loanInterestDaily: 0.008,
  bankruptcyDays: 3,
  bankruptcyThreshold: -500,
  /** Delivery */
  deliveryFee: 3,
  expressFee: 15,
  standardDeliveryMin: 45,
  expressDeliveryMin: 10,
  /** Customers */
  baseCustomersPerHour: 7,
  maxQueuePatienceSec: 75,
  recyclingPerBox: 0.1,
  balePrice: 6,
};

/**
 * Advertising (AdMob). Replace the IDs below with your own from https://admob.google.com
 * before publishing. The defaults are Google's official TEST ids (safe to use while developing).
 */
export const ADS = {
  enabled: true,
  /** Use test ads (MUST be false in the store release, with your real ids filled in). */
  testing: true,
  android: {
    appId: 'ca-app-pub-3940256099942544~3347511713',
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
    rewarded: 'ca-app-pub-3940256099942544/5224354917',
    banner: 'ca-app-pub-3940256099942544/6300978111',
  },
  ios: {
    appId: 'ca-app-pub-3940256099942544~1458002511',
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
    rewarded: 'ca-app-pub-3940256099942544/1712485313',
    banner: 'ca-app-pub-3940256099942544/2934735716',
  },
  /** Target number of interstitial ads per hour of play (shown only at natural breaks). */
  interstitialsPerHour: 10,
  /** Never show two interstitials closer than this (seconds). 3600 / 10 = 360 s. */
  minSecondsBetween: 360,
  /** No interstitial during the first minutes of a session. */
  firstAdAfterSeconds: 150,
  /** Short "Ad break" countdown before an interstitial (Google recommends warning the player). */
  countdownSeconds: 3,
  /** Rewarded ad payouts */
  rewardCashBase: 120,
  rewardCashPerLevel: 35,
  rewardEnergy: 60,
  rewardCooldownSec: 120,
};
