(function() {
  var RedisSessions, SessionHandler, SessionObject,
    __bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  RedisSessions = require("redis-sessions");

  SessionObject = require("./sessionobject");

  module.exports = SessionHandler = (function() {
    function SessionHandler(options, connect) {
      var _apptype, _ref,
        _this = this;
      if (options == null) {
        options = {};
      }
      this.connect = connect;
      this.getAppActivity = __bind(this.getAppActivity, this);
      this.getIdSessions = __bind(this.getIdSessions, this);
      this.getAppSessions = __bind(this.getAppSessions, this);
      this.killIdSessions = __bind(this.killIdSessions, this);
      this.destroy = __bind(this.destroy, this);
      this._redisToSession = __bind(this._redisToSession, this);
      this.set = __bind(this.set, this);
      this.get = __bind(this.get, this);
      this.create = __bind(this.create, this);
      this._getRequestIP = __bind(this._getRequestIP, this);
      this._remCookie = __bind(this._remCookie, this);
      this._setCookie = __bind(this._setCookie, this);
      this.createSession = __bind(this.createSession, this);
      this.generate = __bind(this.generate, this);
      this._error = __bind(this._error, this);
      this._defaultGetApp = __bind(this._defaultGetApp, this);
      if ((options.app != null) && ((_ref = (_apptype = typeof options.app)) === "string" || _ref === "function")) {
        if (_apptype === "function") {
          this.getApp = options.app;
        } else {
          this.getApp = this._defaultGetApp(options.app);
        }
      } else {
        this._error("no-app-defined");
        return;
      }
      this.app = options.app;
      this.utils = connect.utils;
      this.rds = new RedisSessions(options);
      this.redis = this.rds.redis;
      if (options.debug) {
        this.debug = true;
      } else {
        this.debug = false;
      }
      this.ready = false;
      this.redis.on("connect", function() {
        return _this.ready = true;
      });
      this.redis.on("disconnect", function() {
        return _this.ready = false;
      });
      this.trustProxy = options.proxy;
      this.cookie = options.cookie || {};
      this.ttl = options.ttl;
      return;
    }

    SessionHandler.prototype._defaultGetApp = function(app) {
      var _this = this;
      return function(req, cb) {
        return cb(null, app);
      };
    };

    SessionHandler.prototype._error = function(key, cb) {
      var _err, _ref;
      if (typeof key === "string") {
        _err = new Error();
        _err.name = key;
        if (this.ERRORS[key] != null) {
          _err.message = this.ERRORS[key];
        }
      } else {
        _err = key;
      }
      if ((cb != null ? (_ref = cb.constructor) != null ? _ref.name : void 0 : void 0) === "ServerResponse") {
        cb.statusCode = 500;
        cb.end(_err.toString());
        console.error("cannot get appname", _err, _err.stack);
      } else if ((cb != null) && typeof cb === "function") {
        cb(_err);
      } else {
        throw _err;
      }
    };

    SessionHandler.prototype.generate = function(req, token, id) {
      req.sessionID = token;
      req.session = new SessionObject(this, req, this._redisToSession({
        id: id,
        ip: this._getRequestIP(req)
      }));
      req.res.on("header", this._setCookie(req));
    };

    SessionHandler.prototype.createSession = function(req, sess) {
      req.session = new SessionObject(this, req, sess);
      return req.session;
    };

    SessionHandler.prototype._setCookie = function(req) {
      var _this = this;
      return function() {
        var cookie, proto, tls, val;
        if (!req.session) {
          return;
        }
        cookie = new _this.connect.session.Cookie(_this.cookie);
        proto = (req.headers['x-forwarded-proto'] || '').split(',')[0].toLowerCase().trim();
        tls = req.connection.encrypted || (_this.trustProxy && 'https' === proto);
        if (cookie.secure && !tls) {
          if (_this.debug) {
            console.warn("not secured");
          }
          return;
        }
        if (cookie.hasLongExpires) {
          if (_this.debug) {
            console.log("allready set cookie");
          }
          return;
        }
        if (cookie.expires == null) {
          if (!isNew) {
            if (_this.debug) {
              console.log("already set browser-session cooki");
            }
            return;
          }
        } else if (req._originalHash === req.session.hash() && req._originalId === req.session.id) {
          if (_this.debug) {
            console.log("unmodified session");
          }
          return;
        }
        val = cookie.serialize(req._appname, req.sessionID);
        req.res.setHeader('Set-Cookie', val);
      };
    };

    SessionHandler.prototype._remCookie = function(req) {
      var _this = this;
      return function() {
        var cookie, val;
        if (!req.session) {
          return;
        }
        cookie = new _this.connect.session.Cookie(_this.cookie);
        cookie.expires = new Date(0);
        val = cookie.serialize(req._appname, req.sessionID);
        req.res.setHeader('Set-Cookie', val);
      };
    };

    SessionHandler.prototype._getRequestIP = function(req) {
      var _ref;
      if (((_ref = req.headers) != null ? _ref['X-Forwarded-For'] : void 0) != null) {
        return req.headers['X-Forwarded-For'];
      } else {
        return req.connection.remoteAddress;
      }
    };

    SessionHandler.prototype.create = function(req, id, cb) {
      var _this = this;
      this.rds.create({
        app: req._appname,
        ttl: this.ttl,
        id: id,
        ip: this._getRequestIP(req)
      }, function(err, data) {
        if (err) {
          return cb(err);
        }
        cb(null, data.token);
      });
    };

    SessionHandler.prototype.get = function(req, cb) {
      var _this = this;
      this.rds.get({
        app: req._appname,
        token: req.sessionID
      }, function(err, data) {
        if (err) {
          return cb(err);
        }
        if (_this.debug) {
          console.log("GOT", data);
        }
        if ((data != null) && Object.keys(data).length !== 0) {
          if (cb) {
            cb(null, _this._redisToSession(data));
          }
        } else {
          if (cb) {
            cb(null, null);
          }
        }
      });
    };

    SessionHandler.prototype.set = function(req, cb) {
      var _args, _attrs,
        _this = this;
      _args = {
        app: req._appname,
        token: req.sessionID
      };
      _attrs = req.session.attributes();
      if (Object.keys(_attrs).length !== 0) {
        _args.d = req.session.attributes();
      }
      this.rds.set(_args, function(err, data) {
        if (err) {
          return cb(err);
        }
        if ((data != null) && Object.keys(data).length !== 0) {
          if (cb) {
            cb(null, _this._redisToSession(data));
          }
        } else {
          if (cb) {
            cb(null, null);
          }
        }
      });
    };

    SessionHandler.prototype._redisToSession = function(data) {
      var _k, _ref, _sess, _v;
      _sess = {};
      _ref = data.d || {};
      for (_k in _ref) {
        _v = _ref[_k];
        _sess[_k] = _v;
      }
      _sess._meta = {
        id: data.id || null,
        r: data.r || 1,
        w: data.w || 1,
        ttl: data.ttl || this.ttl || 7200,
        idle: data.idle || 0,
        ip: data.ip || ""
      };
      return _sess;
    };

    SessionHandler.prototype.destroy = function(req, cb) {
      var _this = this;
      this.rds.kill({
        app: req._appname,
        token: req.sessionID
      }, function(err, data) {
        if (err) {
          return cb(err);
        }
        if (cb) {
          cb(null, data.kill || 0);
        }
      });
    };

    SessionHandler.prototype.killIdSessions = function(req, cb) {
      var _this = this;
      this.rds.killsoid({
        app: req._appname,
        id: req.session._meta.id
      }, function(err, data) {
        if (err) {
          return cb(err);
        }
        if (cb) {
          cb(null, data.kill || 0);
        }
      });
    };

    SessionHandler.prototype.getAppSessions = function(req, dt, cb) {
      if (dt == null) {
        dt = 600;
      }
      this.rds.soapp({
        app: req._appname,
        dt: dt
      }, cb);
    };

    SessionHandler.prototype.getIdSessions = function(req, cb) {
      this.rds.soid({
        app: req._appname,
        id: req.session._meta.id
      }, cb);
    };

    SessionHandler.prototype.getAppActivity = function(req, dt, cb) {
      if (dt == null) {
        dt = 600;
      }
      this.rds.activity({
        app: req._appname,
        dt: dt
      }, cb);
    };

    SessionHandler.prototype.ERRORS = {
      "no-token": "This is an invalid or outdated session",
      "no-app-defined": "To initialize a ConnectRedisSessions object you have to define the option `app` as a string or function",
      "cookies-disabled": "The cookieParser has not been initialized. Please add `connect.cookieParser()` to your connect/express configuration."
    };

    return SessionHandler;

  })();

}).call(this);
