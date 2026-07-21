// Optional image assets. Rendering code must treat a missing image as a cue to
// use its procedural fallback: loads can fail, and the headless test harness
// intentionally has no DOM Image constructor.
const LandmarkAssets = (() => {
  const manifest = Object.freeze({
    red: 'assets/landmarks/red.png',
    window: 'assets/landmarks/window.png',
    crack: 'assets/landmarks/crack.png',
    clock: 'assets/landmarks/clock.png',
    vend: 'assets/landmarks/vend.png',
    plant: 'assets/landmarks/plant.png',
    cat: 'assets/landmarks/cat.png',
    aquarium: 'assets/landmarks/aquarium.png',
  });

  const records = new Map(Object.entries(manifest).map(([key, src]) => [key, {
    key, src, image: null, state: 'pending', error: null, promise: null,
  }]));

  function imageConstructor() {
    return typeof globalThis.Image === 'function' ? globalThis.Image : null;
  }

  function load(record) {
    if (record.promise || record.state === 'loaded') {
      return record.promise || Promise.resolve(record);
    }

    const ImageCtor = imageConstructor();
    if (!ImageCtor) {
      record.state = 'failed';
      record.error = new Error('Image loading is unavailable in this environment');
      return Promise.resolve(record);
    }

    record.state = 'pending';
    record.promise = new Promise(resolve => {
      let settled = false;
      const finish = (state, error = null) => {
        if (settled) return;
        settled = true;
        record.state = state;
        record.error = error;
        resolve(record);
      };

      try {
        const image = new ImageCtor();
        record.image = image;
        image.decoding = 'async';
        image.onload = () => finish(
          image.complete && image.naturalWidth > 0 ? 'loaded' : 'failed',
          image.naturalWidth > 0 ? null : new Error(`Image is not drawable: ${record.src}`),
        );
        image.onerror = () => finish('failed', new Error(`Could not load image: ${record.src}`));
        image.src = record.src;

        // Some Image implementations complete synchronously for cached assets.
        if (image.complete && image.naturalWidth > 0) finish('loaded');
      } catch (error) {
        record.image = null;
        finish('failed', error);
      }
    });
    return record.promise;
  }

  function summary() {
    const state = { loaded: 0, failed: 0, pending: 0 };
    for (const record of records.values()) state[record.state]++;
    return state;
  }

  function preload() {
    return Promise.all([...records.values()].map(load)).then(summary);
  }

  function get(key) {
    const record = records.get(key);
    const image = record && record.image;
    return record && record.state === 'loaded' && image && image.complete && image.naturalWidth > 0
      ? image
      : null;
  }

  function status(key) {
    return records.get(key)?.state || 'missing';
  }

  const ready = preload();
  return Object.freeze({ manifest, get, status, preload, ready, get state() { return summary(); } });
})();
