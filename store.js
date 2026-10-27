/* Capa de datos: modo local (localStorage) o Firebase (Firestore en tiempo real). */
(function (root) {
  'use strict';
  const LS_KEY = 'pareja_v1';
  const COLLS = ['tx', 'bills', 'months'];
  const FB_VER = '10.14.1';
  const listeners = new Set();
  const authListeners = new Set();
  const state = { config: root.L.defaultConfig(), tx: {}, bills: {}, months: {} };
  let backend = null;
  const clean = (o) => JSON.parse(JSON.stringify(o));
  const emit = () => listeners.forEach((f) => { try { f(state); } catch (e) { console.error(e); } });

  /* ---------------- backend local ---------------- */
  function localBackend() {
    const load = () => {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          state.config = root.L.normalizeConfig(d.config);
          state.tx = d.tx || {}; state.bills = d.bills || {}; state.months = d.months || {};
          return;
        }
      } catch (e) { console.warn('No se pudo leer el almacenamiento local', e); }
      state.config = root.L.defaultConfig();
      state.tx = {}; state.bills = {}; state.months = {};
    };
    const save = () => {
      try { localStorage.setItem(LS_KEY, JSON.stringify({ config: state.config, tx: state.tx, bills: state.bills, months: state.months })); }
      catch (e) { console.warn('No se pudo guardar', e); }
    };
    load();
    window.addEventListener('storage', (e) => { if (e.key === LS_KEY) { load(); emit(); } });
    return {
      mode: 'local',
      async start() { root.Store.ready = true; emit(); return { needsLogin: false }; },
      setConfig(c) { state.config = c; save(); emit(); },
      put(coll, id, obj) { state[coll][id] = obj; save(); emit(); },
      del(coll, id) { delete state[coll][id]; save(); emit(); },
      replaceAll(d) {
        state.config = root.L.normalizeConfig(d.config); state.tx = d.tx || {}; state.bills = d.bills || {}; state.months = d.months || {};
        save(); emit();
      },
    };
  }

  /* ---------------- backend Firebase ---------------- */
  function firebaseBackend(cfg) {
    let fs, auth, db, authMod, user = null, unsubs = [];
    const loaded = {};
    return {
      mode: 'firebase',
      async start() {
        const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
        const [appMod, fsMod, aMod] = await Promise.all([
          import(base + 'firebase-app.js'), import(base + 'firebase-firestore.js'), import(base + 'firebase-auth.js'),
        ]);
        fs = fsMod; authMod = aMod;
        const app = appMod.initializeApp(cfg);
        try {
          db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
        } catch (e) { db = fs.getFirestore(app); }
        auth = authMod.getAuth(app);
        return new Promise((resolve) => {
          let first = true;
          authMod.onAuthStateChanged(auth, (u) => {
            user = u;
            unsubs.forEach((f) => f()); unsubs = [];
            if (u) attach();
            authListeners.forEach((f) => f(u));
            if (first) { first = false; resolve({ needsLogin: !u }); }
          });
        });
      },
      attach() { },
      async login(email, pw) { await authMod.signInWithEmailAndPassword(auth, email, pw); },
      async logout() { await authMod.signOut(auth); },
      setConfig(c) { state.config = c; emit(); return fs.setDoc(fs.doc(db, 'meta', 'config'), clean(c)); },
      put(coll, id, obj) { state[coll][id] = obj; emit(); return fs.setDoc(fs.doc(db, coll, id), clean(obj)); },
      del(coll, id) { delete state[coll][id]; emit(); return fs.deleteDoc(fs.doc(db, coll, id)); },
      async replaceAll(d) {
        // borra lo que haya y escribe lo nuevo, en tandas de 400
        const ops = [];
        for (const c of COLLS) {
          const snap = await fs.getDocs(fs.collection(db, c));
          snap.forEach((s) => ops.push((b) => b.delete(s.ref)));
          for (const id in (d[c] || {})) ops.push((b) => b.set(fs.doc(db, c, id), clean(d[c][id])));
        }
        ops.push((b) => b.set(fs.doc(db, 'meta', 'config'), clean(root.L.normalizeConfig(d.config))));
        for (let i = 0; i < ops.length; i += 400) {
          const b = fs.writeBatch(db);
          ops.slice(i, i + 400).forEach((op) => op(b));
          await b.commit();
        }
      },
    };
    function attach() {
      for (const c of COLLS) {
        unsubs.push(fs.onSnapshot(fs.collection(db, c), (snap) => {
          const o = {}; snap.forEach((s) => { o[s.id] = s.data(); });
          state[c] = o; loaded[c] = true; emit();
        }, (err) => console.error('Firestore', c, err)));
      }
      unsubs.push(fs.onSnapshot(fs.doc(db, 'meta', 'config'), (snap) => {
        if (snap.exists()) state.config = root.L.normalizeConfig(snap.data());
        else if (!snap.metadata.fromCache) fs.setDoc(fs.doc(db, 'meta', 'config'), clean(state.config));
        loaded.config = true; root.Store.ready = true; emit();
      }, (err) => console.error('Firestore config', err)));
    }
  }

  const Store = {
    state,
    mode: 'local',
    ready: false,
    onChange(f) { listeners.add(f); return () => listeners.delete(f); },
    onAuth(f) { authListeners.add(f); },
    async init() {
      const cfg = root.FIREBASE_CONFIG;
      backend = cfg && cfg.apiKey ? firebaseBackend(cfg) : localBackend();
      Store.mode = backend.mode;
      // la función attach vive dentro del cierre de firebaseBackend; se invoca desde start()
      return backend.start();
    },
    setConfig(c) { return backend.setConfig(c); },
    put(coll, id, obj) { return backend.put(coll, id, obj); },
    del(coll, id) { return backend.del(coll, id); },
    replaceAll(d) { return backend.replaceAll(d); },
    login(e, p) { return backend.login(e, p); },
    logout() { return backend.logout(); },
    exportData() { return clean({ config: state.config, tx: state.tx, bills: state.bills, months: state.months }); },
  };
  root.Store = Store;
})(window);
