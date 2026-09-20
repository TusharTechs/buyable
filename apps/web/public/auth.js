/**
 * Signing in.
 *
 * The authorization code flow with PKCE, against Cognito's hosted pages. No password
 * is ever typed into anything in this repository, which is the main reason for doing
 * it this way: a sign-in form here would mean handling, storing and resetting
 * credentials, and the failure mode there is not a bug report, it is somebody else's
 * password.
 *
 * Two decisions worth stating, because both cost something:
 *
 *  - **No refresh token is kept.** Cognito will issue one and this code throws it
 *    away. A refresh token sitting in browser storage is a month-long credential
 *    waiting for the first cross-site scripting bug; the access token expires in an
 *    hour and takes the exposure with it. The cost is that signing in again is needed
 *    after an hour, and because the hosted session cookie is still valid that is a
 *    redirect rather than a password.
 *  - **sessionStorage, not localStorage.** A token then dies with the tab instead of
 *    persisting on a machine that may be shared.
 *
 * Nothing on this site requires any of it. Signing in adds ownership and history; it
 * is not a gate in front of the product.
 */
(function () {
  "use strict";

  var CONFIG = (window.BUYABLE_CONFIG && window.BUYABLE_CONFIG.auth) || null;
  var TOKEN_KEY = "buyable.token";
  var VERIFIER_KEY = "buyable.pkce";
  var STATE_KEY = "buyable.state";
  var RETURN_KEY = "buyable.return";

  /**
   * Make sure the wiring this page is running is the current wiring.
   *
   * config.js is generated at deploy time and holds the API address and the sign in
   * details. Deploying sign in and then opening the site in a browser that had been
   * there before produced a page confidently announcing that sign in was not
   * configured: the edge had the new file, that browser had the old one, and the old
   * one had no auth block in it at all.
   *
   * The cache headers are fixed now, which helps everybody who arrives from here on
   * and does nothing for anybody already holding a copy. So rather than tell a reader
   * something untrue about the deployment, check: re-request the file past the cache,
   * once, and see. A page that might be running stale wiring should look at its
   * wiring before drawing conclusions from it.
   */
  function ready() {
    if (CONFIG) return Promise.resolve(true);
    if (!window.BUYABLE_CONFIG) return Promise.resolve(false);

    return new Promise(function (resolve) {
      var script = document.createElement("script");
      // A query the cache has never seen, which is the only reliable way to force a
      // subresource past a copy the browser considers fresh.
      script.src = "/config.js?reload=" + Date.now();
      script.onload = function () {
        CONFIG = (window.BUYABLE_CONFIG && window.BUYABLE_CONFIG.auth) || null;
        resolve(!!CONFIG);
      };
      script.onerror = function () {
        resolve(false);
      };
      document.head.appendChild(script);
    });
  }

  /** sessionStorage throws in some privacy modes. Nothing here is worth a crash. */
  function store(key, value) {
    try {
      if (value === null) window.sessionStorage.removeItem(key);
      else window.sessionStorage.setItem(key, value);
    } catch (e) {
      /* signed out for this session, which is a degradation and not a failure */
    }
  }

  function read(key) {
    try {
      return window.sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function base64url(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function randomString() {
    return base64url(window.crypto.getRandomValues(new Uint8Array(32)));
  }

  function challengeFor(verifier) {
    return window.crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(verifier))
      .then(function (digest) {
        return base64url(new Uint8Array(digest));
      });
  }

  /** The id token, if one is held and has not expired. */
  function token() {
    var raw = read(TOKEN_KEY);
    if (!raw) return null;
    try {
      var held = JSON.parse(raw);
      // A minute of margin, so a request started just before expiry does not arrive
      // just after it.
      if (held.expiresAt - 60000 < Date.now()) {
        store(TOKEN_KEY, null);
        return null;
      }
      return held;
    } catch (e) {
      store(TOKEN_KEY, null);
      return null;
    }
  }

  function signedIn() {
    return !!token();
  }

  /** The email in the id token, for showing who is signed in. Never used as identity. */
  function email() {
    var held = token();
    if (!held) return "";
    try {
      var payload = held.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(window.atob(payload)).email || "";
    } catch (e) {
      return "";
    }
  }

  function signIn(returnTo) {
    if (!CONFIG) return;
    var verifier = randomString();
    var state = randomString();
    store(VERIFIER_KEY, verifier);
    store(STATE_KEY, state);
    store(RETURN_KEY, returnTo || window.location.pathname + window.location.search);

    challengeFor(verifier).then(function (challenge) {
      var params = new URLSearchParams({
        response_type: "code",
        client_id: CONFIG.clientId,
        redirect_uri: CONFIG.redirectUri,
        scope: "openid email",
        state: state,
        code_challenge: challenge,
        code_challenge_method: "S256"
      });
      window.location.assign(CONFIG.domain + "/oauth2/authorize?" + params.toString());
    });
  }

  function signOut() {
    store(TOKEN_KEY, null);
    if (!CONFIG) return;
    var params = new URLSearchParams({
      client_id: CONFIG.clientId,
      logout_uri: CONFIG.signOutUri
    });
    window.location.assign(CONFIG.domain + "/logout?" + params.toString());
  }

  /**
   * Finish the flow after Cognito redirects back.
   *
   * Resolves with where the user was going, or null when this is not a callback.
   * Rejects when something is wrong, and a mismatched state is treated as wrong
   * rather than ignored: it is the one signal that this redirect was not the one we
   * started.
   */
  function completeSignIn() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get("code");
    var returnedState = params.get("state");
    var error = params.get("error");

    if (error) {
      return Promise.reject(new Error(params.get("error_description") || error));
    }
    if (!code) return Promise.resolve(null);

    var expected = read(STATE_KEY);
    var verifier = read(VERIFIER_KEY);
    store(STATE_KEY, null);
    store(VERIFIER_KEY, null);

    if (!expected || returnedState !== expected) {
      return Promise.reject(new Error("This sign in did not start here, so it was not completed."));
    }
    if (!verifier) {
      return Promise.reject(new Error("The sign in could not be completed in this tab. Try again."));
    }

    var body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CONFIG.clientId,
      code: code,
      redirect_uri: CONFIG.redirectUri,
      code_verifier: verifier
    });

    return fetch(CONFIG.domain + "/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString()
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Could not complete sign in.");
        return response.json();
      })
      .then(function (data) {
        // The refresh token in data.refresh_token is deliberately not kept. See the
        // note at the top of this file.
        store(
          TOKEN_KEY,
          JSON.stringify({
            idToken: data.id_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000
          })
        );
        // The code is single use and spent. Leaving it in the address bar means a
        // reload tries to redeem it again and fails for no reason the reader can see.
        window.history.replaceState(null, "", window.location.pathname);
        var back = read(RETURN_KEY);
        store(RETURN_KEY, null);
        return back || "/account/";
      });
  }

  /**
   * fetch, with the token attached when there is one.
   *
   * The id token rather than the access token, because the API authorizer is
   * configured with the app client as its audience and that is the claim an id token
   * carries.
   */
  function authedFetch(url, options) {
    var settings = options || {};
    var headers = Object.assign({}, settings.headers || {});
    var held = token();
    if (held) headers.Authorization = "Bearer " + held.idToken;
    return window.fetch(url, Object.assign({}, settings, { headers: headers }));
  }

  window.BuyableAuth = {
    /** Synchronous and possibly stale. Anything that matters waits for ready(). */
    available: !!CONFIG,
    ready: ready,
    signedIn: signedIn,
    email: email,
    signIn: signIn,
    signOut: signOut,
    completeSignIn: completeSignIn,
    authedFetch: authedFetch
  };
})();
