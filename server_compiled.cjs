var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/ip-address/dist/address-error.js
var require_address_error = __commonJS({
  "node_modules/ip-address/dist/address-error.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.AddressError = void 0;
    var AddressError = class extends Error {
      constructor(message, parseMessage) {
        super(message);
        this.name = "AddressError";
        this.parseMessage = parseMessage;
      }
    };
    exports2.AddressError = AddressError;
  }
});

// node_modules/ip-address/dist/common.js
var require_common = __commonJS({
  "node_modules/ip-address/dist/common.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.isInSubnet = isInSubnet;
    exports2.isCorrect = isCorrect;
    exports2.prefixLengthFromMask = prefixLengthFromMask;
    exports2.numberToPaddedHex = numberToPaddedHex;
    exports2.stringToPaddedHex = stringToPaddedHex;
    exports2.testBit = testBit;
    var address_error_1 = require_address_error();
    function isInSubnet(address) {
      if (this.subnetMask < address.subnetMask) {
        return false;
      }
      if (this.mask(address.subnetMask) === address.mask()) {
        return true;
      }
      return false;
    }
    function isCorrect(defaultBits) {
      return function() {
        if (this.addressMinusSuffix !== this.correctForm()) {
          return false;
        }
        if (this.subnetMask === defaultBits && !this.parsedSubnet) {
          return true;
        }
        return this.parsedSubnet === String(this.subnetMask);
      };
    }
    function prefixLengthFromMask(value, totalBits) {
      const binary = value.toString(2).padStart(totalBits, "0");
      if (binary.length > totalBits) {
        throw new address_error_1.AddressError("Invalid subnet mask.");
      }
      const firstZero = binary.indexOf("0");
      if (firstZero === -1) {
        return totalBits;
      }
      if (binary.slice(firstZero).includes("1")) {
        throw new address_error_1.AddressError("Invalid subnet mask.");
      }
      return firstZero;
    }
    function numberToPaddedHex(number) {
      return number.toString(16).padStart(2, "0");
    }
    function stringToPaddedHex(numberString) {
      return numberToPaddedHex(parseInt(numberString, 10));
    }
    function testBit(binaryValue, position) {
      const { length } = binaryValue;
      if (position > length) {
        return false;
      }
      const positionInString = length - position;
      return binaryValue.substring(positionInString, positionInString + 1) === "1";
    }
  }
});

// node_modules/ip-address/dist/v4/constants.js
var require_constants = __commonJS({
  "node_modules/ip-address/dist/v4/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RE_SUBNET_STRING = exports2.RE_ADDRESS = exports2.GROUPS = exports2.BITS = void 0;
    exports2.BITS = 32;
    exports2.GROUPS = 4;
    exports2.RE_ADDRESS = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/g;
    exports2.RE_SUBNET_STRING = /\/\d{1,2}$/;
  }
});

// node_modules/ip-address/dist/ipv4.js
var require_ipv4 = __commonJS({
  "node_modules/ip-address/dist/ipv4.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m2, k);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m2[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Address4 = void 0;
    var common = __importStar(require_common());
    var constants = __importStar(require_constants());
    var address_error_1 = require_address_error();
    var isCorrect4 = common.isCorrect(constants.BITS);
    var Address4 = class _Address4 {
      constructor(address) {
        this.groups = constants.GROUPS;
        this.parsedAddress = [];
        this.parsedSubnet = "";
        this.subnet = "/32";
        this.subnetMask = 32;
        this.v4 = true;
        this.isCorrect = isCorrect4;
        this.isInSubnet = common.isInSubnet;
        this.address = address;
        const subnet = constants.RE_SUBNET_STRING.exec(address);
        if (subnet) {
          this.parsedSubnet = subnet[0].replace("/", "");
          this.subnetMask = parseInt(this.parsedSubnet, 10);
          this.subnet = `/${this.subnetMask}`;
          if (this.subnetMask < 0 || this.subnetMask > constants.BITS) {
            throw new address_error_1.AddressError("Invalid subnet mask.");
          }
          address = address.replace(constants.RE_SUBNET_STRING, "");
        }
        this.addressMinusSuffix = address;
        this.parsedAddress = this.parse(address);
      }
      /**
       * Returns true if the given string is a valid IPv4 address (with optional
       * CIDR subnet), false otherwise. Host bits in the subnet portion are
       * allowed (e.g. `192.168.1.5/24` is valid); for strict network-address
       * validation compare `correctForm()` to `startAddress().correctForm()`,
       * or use `networkForm()`.
       */
      static isValid(address) {
        try {
          new _Address4(address);
          return true;
        } catch (e2) {
          return false;
        }
      }
      /**
       * Parses an IPv4 address string into its four octet groups and stores the
       * result on `this.parsedAddress`. Called automatically by the constructor;
       * you typically don't need to call it directly. Throws `AddressError` if
       * the input is not a valid IPv4 address.
       */
      parse(address) {
        const groups = address.split(".");
        if (!address.match(constants.RE_ADDRESS)) {
          throw new address_error_1.AddressError("Invalid IPv4 address.");
        }
        return groups;
      }
      /**
       * Returns the address in correct form: octets joined with `.` and any
       * leading zeros stripped (e.g. `192.168.1.1`). For IPv4 this matches the
       * canonical dotted-decimal representation.
       */
      correctForm() {
        return this.parsedAddress.map((part) => parseInt(part, 10)).join(".");
      }
      /**
       * Construct an `Address4` from an address and a dotted-decimal subnet
       * mask given as separate strings (e.g. as returned by Node's
       * `os.networkInterfaces()`). Throws `AddressError` if the mask is
       * non-contiguous (e.g. `255.0.255.0`).
       * @example
       * var address = Address4.fromAddressAndMask('192.168.1.1', '255.255.255.0');
       * address.subnetMask; // 24
       */
      static fromAddressAndMask(address, mask) {
        const bits = common.prefixLengthFromMask(new _Address4(mask).bigInt(), constants.BITS);
        return new _Address4(`${address}/${bits}`);
      }
      /**
       * Construct an `Address4` from an address and a Cisco-style wildcard mask
       * given as separate strings (e.g. `0.0.0.255` for a `/24`). The wildcard
       * mask is the bitwise inverse of the subnet mask. Throws `AddressError`
       * if the mask is non-contiguous (e.g. `0.255.0.255`).
       * @example
       * var address = Address4.fromAddressAndWildcardMask('10.0.0.1', '0.0.0.255');
       * address.subnetMask; // 24
       */
      static fromAddressAndWildcardMask(address, wildcardMask) {
        const wildcard = new _Address4(wildcardMask).bigInt();
        const allOnes = (BigInt(1) << BigInt(constants.BITS)) - BigInt(1);
        const mask = wildcard ^ allOnes;
        const bits = common.prefixLengthFromMask(mask, constants.BITS);
        return new _Address4(`${address}/${bits}`);
      }
      /**
       * Construct an `Address4` from a wildcard pattern with trailing `*`
       * octets. The number of trailing wildcards determines the prefix
       * length: each `*` represents 8 bits.
       *
       * Only trailing whole-octet wildcards are supported. Partial-octet
       * wildcards (e.g. `192.168.0.1*`) and interior wildcards (e.g.
       * `192.*.0.1`) throw `AddressError`.
       * @example
       * Address4.fromWildcard('192.168.0.*').subnet;   // '/24'
       * Address4.fromWildcard('192.168.*.*').subnet;   // '/16'
       * Address4.fromWildcard('*.*.*.*').subnet;       // '/0'
       */
      static fromWildcard(input) {
        const groups = input.split(".");
        if (groups.length !== constants.GROUPS) {
          throw new address_error_1.AddressError("Wildcard pattern must have 4 octets");
        }
        let firstWildcard = -1;
        for (let i2 = 0; i2 < groups.length; i2++) {
          if (groups[i2] === "*") {
            if (firstWildcard === -1) {
              firstWildcard = i2;
            }
          } else if (firstWildcard !== -1) {
            throw new address_error_1.AddressError("Wildcard `*` must only appear in trailing octets (e.g. `192.168.0.*`)");
          }
        }
        const trailing = firstWildcard === -1 ? 0 : groups.length - firstWildcard;
        const replaced = groups.map((g) => g === "*" ? "0" : g);
        const subnetBits = constants.BITS - trailing * 8;
        return new _Address4(`${replaced.join(".")}/${subnetBits}`);
      }
      /**
       * Converts a hex string to an IPv4 address object. Accepts 8 hex digits
       * with optional `:` separators (e.g. `'7f000001'` or `'7f:00:00:01'`).
       * Throws `AddressError` for any other length or for non-hex characters.
       * @param {string} hex - a hex string to convert
       * @returns {Address4}
       */
      static fromHex(hex) {
        const stripped = hex.replace(/:/g, "");
        if (!/^[0-9a-fA-F]{8}$/.test(stripped)) {
          throw new address_error_1.AddressError("IPv4 hex must be exactly 8 hex digits");
        }
        const groups = [];
        for (let i2 = 0; i2 < 8; i2 += 2) {
          groups.push(parseInt(stripped.slice(i2, i2 + 2), 16));
        }
        return new _Address4(groups.join("."));
      }
      /**
       * Converts an integer into a IPv4 address object. The integer must be a
       * non-negative safe integer in the range `[0, 2**32 - 1]`; otherwise
       * `AddressError` is thrown.
       * @param {integer} integer - a number to convert
       * @returns {Address4}
       */
      static fromInteger(integer) {
        if (!Number.isInteger(integer) || integer < 0 || integer > 4294967295) {
          throw new address_error_1.AddressError("IPv4 integer must be in the range 0 to 2**32 - 1");
        }
        return _Address4.fromHex(integer.toString(16).padStart(8, "0"));
      }
      /**
       * Return an address from in-addr.arpa form
       * @param {string} arpaFormAddress - an 'in-addr.arpa' form ipv4 address
       * @returns {Adress4}
       * @example
       * var address = Address4.fromArpa(42.2.0.192.in-addr.arpa.)
       * address.correctForm(); // '192.0.2.42'
       */
      static fromArpa(arpaFormAddress) {
        const leader = arpaFormAddress.replace(/(\.in-addr\.arpa)?\.$/, "");
        const address = leader.split(".").reverse().join(".");
        return new _Address4(address);
      }
      /**
       * Converts an IPv4 address object to a hex string
       * @returns {String}
       */
      toHex() {
        return this.parsedAddress.map((part) => common.stringToPaddedHex(part)).join(":");
      }
      /**
       * Converts an IPv4 address object to an array of bytes.
       *
       * To get a Node.js `Buffer`, wrap the result: `Buffer.from(address.toArray())`.
       * @returns {Array}
       */
      toArray() {
        return this.parsedAddress.map((part) => parseInt(part, 10));
      }
      /**
       * Converts an IPv4 address object to an IPv6 address group
       * @returns {String}
       */
      toGroup6() {
        const output = [];
        let i2;
        for (i2 = 0; i2 < constants.GROUPS; i2 += 2) {
          output.push(`${common.stringToPaddedHex(this.parsedAddress[i2])}${common.stringToPaddedHex(this.parsedAddress[i2 + 1])}`);
        }
        return output.join(":");
      }
      /**
       * Returns the address as a `bigint`
       * @returns {bigint}
       */
      bigInt() {
        return BigInt(`0x${this.parsedAddress.map((n) => common.stringToPaddedHex(n)).join("")}`);
      }
      /**
       * Helper function getting start address.
       * @returns {bigint}
       */
      _startAddress() {
        return BigInt(`0b${this.mask() + "0".repeat(constants.BITS - this.subnetMask)}`);
      }
      /**
       * The first address in the range given by this address' subnet.
       * Often referred to as the Network Address.
       * @returns {Address4}
       */
      startAddress() {
        return _Address4.fromBigInt(this._startAddress());
      }
      /**
       * The first host address in the range given by this address's subnet ie
       * the first address after the Network Address
       * @returns {Address4}
       */
      startAddressExclusive() {
        const adjust = BigInt("1");
        return _Address4.fromBigInt(this._startAddress() + adjust);
      }
      /**
       * Helper function getting end address.
       * @returns {bigint}
       */
      _endAddress() {
        return BigInt(`0b${this.mask() + "1".repeat(constants.BITS - this.subnetMask)}`);
      }
      /**
       * The last address in the range given by this address' subnet
       * Often referred to as the Broadcast
       * @returns {Address4}
       */
      endAddress() {
        return _Address4.fromBigInt(this._endAddress());
      }
      /**
       * The last host address in the range given by this address's subnet ie
       * the last address prior to the Broadcast Address
       * @returns {Address4}
       */
      endAddressExclusive() {
        const adjust = BigInt("1");
        return _Address4.fromBigInt(this._endAddress() - adjust);
      }
      /**
       * The dotted-decimal form of the subnet mask, e.g. `255.255.240.0` for
       * a `/20`. Returns an `Address4`; call `.correctForm()` for the string.
       * @returns {Address4}
       */
      subnetMaskAddress() {
        return _Address4.fromBigInt(BigInt(`0b${"1".repeat(this.subnetMask)}${"0".repeat(constants.BITS - this.subnetMask)}`));
      }
      /**
       * The Cisco-style wildcard mask, e.g. `0.0.0.255` for a `/24`. This is
       * the bitwise inverse of `subnetMaskAddress()`. Returns an `Address4`;
       * call `.correctForm()` for the string.
       * @returns {Address4}
       */
      wildcardMask() {
        return _Address4.fromBigInt(BigInt(`0b${"0".repeat(this.subnetMask)}${"1".repeat(constants.BITS - this.subnetMask)}`));
      }
      /**
       * The network address in CIDR string form, e.g. `192.168.1.0/24` for
       * `192.168.1.5/24`. For an address with no explicit subnet the prefix is
       * `/32`, e.g. `networkForm()` on `192.168.1.5` returns `192.168.1.5/32`.
       * @returns {string}
       */
      networkForm() {
        return `${this.startAddress().correctForm()}/${this.subnetMask}`;
      }
      /**
       * Converts a BigInt to a v4 address object. The value must be in the
       * range `[0, 2**32 - 1]`; otherwise `AddressError` is thrown.
       * @param {bigint} bigInt - a BigInt to convert
       * @returns {Address4}
       */
      static fromBigInt(bigInt) {
        if (bigInt < 0n || bigInt > 0xffffffffn) {
          throw new address_error_1.AddressError("IPv4 BigInt must be in the range 0 to 2**32 - 1");
        }
        return _Address4.fromHex(bigInt.toString(16).padStart(8, "0"));
      }
      /**
       * Convert a byte array to an Address4 object.
       *
       * To convert from a Node.js `Buffer`, spread it: `Address4.fromByteArray([...buf])`.
       * @param {Array<number>} bytes - an array of 4 bytes (0-255)
       * @returns {Address4}
       */
      static fromByteArray(bytes) {
        if (bytes.length !== 4) {
          throw new address_error_1.AddressError("IPv4 addresses require exactly 4 bytes");
        }
        for (let i2 = 0; i2 < bytes.length; i2++) {
          if (!Number.isInteger(bytes[i2]) || bytes[i2] < 0 || bytes[i2] > 255) {
            throw new address_error_1.AddressError("All bytes must be integers between 0 and 255");
          }
        }
        return this.fromUnsignedByteArray(bytes);
      }
      /**
       * Convert an unsigned byte array to an Address4 object
       * @param {Array<number>} bytes - an array of 4 unsigned bytes (0-255)
       * @returns {Address4}
       */
      static fromUnsignedByteArray(bytes) {
        if (bytes.length !== 4) {
          throw new address_error_1.AddressError("IPv4 addresses require exactly 4 bytes");
        }
        const address = bytes.join(".");
        return new _Address4(address);
      }
      /**
       * Returns the first n bits of the address, defaulting to the
       * subnet mask
       * @returns {String}
       */
      mask(mask) {
        if (mask === void 0) {
          mask = this.subnetMask;
        }
        return this.getBitsBase2(0, mask);
      }
      /**
       * Returns the bits in the given range as a base-2 string
       * @returns {string}
       */
      getBitsBase2(start, end) {
        return this.binaryZeroPad().slice(start, end);
      }
      /**
       * Return the reversed ip6.arpa form of the address
       * @param {Object} options
       * @param {boolean} options.omitSuffix - omit the "in-addr.arpa" suffix
       * @returns {String}
       */
      reverseForm(options) {
        if (!options) {
          options = {};
        }
        const reversed = this.correctForm().split(".").reverse().join(".");
        if (options.omitSuffix) {
          return reversed;
        }
        return `${reversed}.in-addr.arpa.`;
      }
      /**
       * Returns true if the given address is a multicast address
       * @returns {boolean}
       */
      isMulticast() {
        return this.isInSubnet(MULTICAST_V4);
      }
      /**
       * Returns true if the address is in one of the [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) private address ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
       * @returns {boolean}
       */
      isPrivate() {
        return PRIVATE_V4.some((subnet) => this.isInSubnet(subnet));
      }
      /**
       * Returns true if the address is in the loopback range `127.0.0.0/8` ([RFC 1122](https://datatracker.ietf.org/doc/html/rfc1122)).
       * @returns {boolean}
       */
      isLoopback() {
        return this.isInSubnet(LOOPBACK_V4);
      }
      /**
       * Returns true if the address is in the link-local range `169.254.0.0/16` ([RFC 3927](https://datatracker.ietf.org/doc/html/rfc3927)).
       * @returns {boolean}
       */
      isLinkLocal() {
        return this.isInSubnet(LINK_LOCAL_V4);
      }
      /**
       * Returns true if the address is the unspecified address `0.0.0.0`.
       * @returns {boolean}
       */
      isUnspecified() {
        return this.isInSubnet(UNSPECIFIED_V4);
      }
      /**
       * Returns true if the address is the limited broadcast address `255.255.255.255` ([RFC 919](https://datatracker.ietf.org/doc/html/rfc919)).
       * @returns {boolean}
       */
      isBroadcast() {
        return this.isInSubnet(BROADCAST_V4);
      }
      /**
       * Returns true if the address is in the carrier-grade NAT range `100.64.0.0/10` ([RFC 6598](https://datatracker.ietf.org/doc/html/rfc6598)).
       * @returns {boolean}
       */
      isCGNAT() {
        return this.isInSubnet(CGNAT_V4);
      }
      /**
       * Returns a zero-padded base-2 string representation of the address
       * @returns {string}
       */
      binaryZeroPad() {
        if (this._binaryZeroPad === void 0) {
          this._binaryZeroPad = this.bigInt().toString(2).padStart(constants.BITS, "0");
        }
        return this._binaryZeroPad;
      }
      /**
       * Groups an IPv4 address for inclusion at the end of an IPv6 address
       * @returns {String}
       */
      groupForV6() {
        const segments = this.parsedAddress;
        return this.address.replace(constants.RE_ADDRESS, `<span class="hover-group group-v4 group-6">${segments.slice(0, 2).join(".")}</span>.<span class="hover-group group-v4 group-7">${segments.slice(2, 4).join(".")}</span>`);
      }
    };
    exports2.Address4 = Address4;
    var MULTICAST_V4 = new Address4("224.0.0.0/4");
    var PRIVATE_V4 = [
      new Address4("10.0.0.0/8"),
      new Address4("172.16.0.0/12"),
      new Address4("192.168.0.0/16")
    ];
    var LOOPBACK_V4 = new Address4("127.0.0.0/8");
    var LINK_LOCAL_V4 = new Address4("169.254.0.0/16");
    var UNSPECIFIED_V4 = new Address4("0.0.0.0/32");
    var BROADCAST_V4 = new Address4("255.255.255.255/32");
    var CGNAT_V4 = new Address4("100.64.0.0/10");
  }
});

// node_modules/ip-address/dist/v6/constants.js
var require_constants2 = __commonJS({
  "node_modules/ip-address/dist/v6/constants.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.RE_URL_WITH_PORT = exports2.RE_URL = exports2.RE_ZONE_STRING = exports2.RE_SUBNET_STRING = exports2.RE_BAD_ADDRESS = exports2.RE_BAD_CHARACTERS = exports2.TYPES = exports2.SCOPES = exports2.GROUPS = exports2.BITS = void 0;
    exports2.BITS = 128;
    exports2.GROUPS = 8;
    exports2.SCOPES = {
      0: "Reserved",
      1: "Interface local",
      2: "Link local",
      4: "Admin local",
      5: "Site local",
      8: "Organization local",
      14: "Global",
      15: "Reserved"
    };
    exports2.TYPES = {
      "ff01::1/128": "Multicast (All nodes on this interface)",
      "ff01::2/128": "Multicast (All routers on this interface)",
      "ff02::1/128": "Multicast (All nodes on this link)",
      "ff02::2/128": "Multicast (All routers on this link)",
      "ff05::2/128": "Multicast (All routers in this site)",
      "ff02::5/128": "Multicast (OSPFv3 AllSPF routers)",
      "ff02::6/128": "Multicast (OSPFv3 AllDR routers)",
      "ff02::9/128": "Multicast (RIP routers)",
      "ff02::a/128": "Multicast (EIGRP routers)",
      "ff02::d/128": "Multicast (PIM routers)",
      "ff02::16/128": "Multicast (MLDv2 reports)",
      "ff01::fb/128": "Multicast (mDNSv6)",
      "ff02::fb/128": "Multicast (mDNSv6)",
      "ff05::fb/128": "Multicast (mDNSv6)",
      "ff02::1:2/128": "Multicast (All DHCP servers and relay agents on this link)",
      "ff05::1:2/128": "Multicast (All DHCP servers and relay agents in this site)",
      "ff02::1:3/128": "Multicast (All DHCP servers on this link)",
      "ff05::1:3/128": "Multicast (All DHCP servers in this site)",
      "::/128": "Unspecified",
      "::1/128": "Loopback",
      "ff00::/8": "Multicast",
      "fe80::/10": "Link-local unicast",
      "fc00::/7": "Unique local",
      "2002::/16": "6to4",
      "2001:db8::/32": "Documentation",
      "64:ff9b::/96": "NAT64 (well-known)",
      "64:ff9b:1::/48": "NAT64 (local-use)"
    };
    exports2.RE_BAD_CHARACTERS = /([^0-9a-f:/%])/gi;
    exports2.RE_BAD_ADDRESS = /([0-9a-f]{5,}|:{3,}|[^:]:$|^:[^:]|\/$)/gi;
    exports2.RE_SUBNET_STRING = /\/\d{1,3}(?=%|$)/;
    exports2.RE_ZONE_STRING = /%.*$/;
    exports2.RE_URL = /^\[{0,1}([0-9a-f:]+)\]{0,1}/;
    exports2.RE_URL_WITH_PORT = /\[([0-9a-f:]+)\]:([0-9]{1,5})/;
  }
});

// node_modules/ip-address/dist/v6/helpers.js
var require_helpers = __commonJS({
  "node_modules/ip-address/dist/v6/helpers.js"(exports2) {
    "use strict";
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.escapeHtml = escapeHtml;
    exports2.spanAllZeroes = spanAllZeroes;
    exports2.spanAll = spanAll;
    exports2.spanLeadingZeroes = spanLeadingZeroes;
    exports2.simpleGroup = simpleGroup;
    function escapeHtml(s2) {
      return s2.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }
    function spanAllZeroes(s2) {
      return escapeHtml(s2).replace(/(0+)/g, '<span class="zero">$1</span>');
    }
    function spanAll(s2, offset = 0) {
      const letters = s2.split("");
      return letters.map((n, i2) => `<span class="digit value-${escapeHtml(n)} position-${i2 + offset}">${spanAllZeroes(n)}</span>`).join("");
    }
    function spanLeadingZeroesSimple(group) {
      return escapeHtml(group).replace(/^(0+)/, '<span class="zero">$1</span>');
    }
    function spanLeadingZeroes(address) {
      const groups = address.split(":");
      return groups.map((g) => spanLeadingZeroesSimple(g)).join(":");
    }
    function simpleGroup(addressString, offset = 0) {
      const groups = addressString.split(":");
      return groups.map((g, i2) => {
        if (/group-v4/.test(g)) {
          return g;
        }
        return `<span class="hover-group group-${i2 + offset}">${spanLeadingZeroesSimple(g)}</span>`;
      });
    }
  }
});

// node_modules/ip-address/dist/v6/regular-expressions.js
var require_regular_expressions = __commonJS({
  "node_modules/ip-address/dist/v6/regular-expressions.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m2, k);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m2[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.ADDRESS_BOUNDARY = void 0;
    exports2.groupPossibilities = groupPossibilities;
    exports2.padGroup = padGroup;
    exports2.simpleRegularExpression = simpleRegularExpression;
    exports2.possibleElisions = possibleElisions;
    var v6 = __importStar(require_constants2());
    function groupPossibilities(possibilities) {
      return `(${possibilities.join("|")})`;
    }
    function padGroup(group) {
      if (group.length < 4) {
        return `0{0,${4 - group.length}}${group}`;
      }
      return group;
    }
    exports2.ADDRESS_BOUNDARY = "[^A-Fa-f0-9:]";
    function simpleRegularExpression(groups) {
      const zeroIndexes = [];
      groups.forEach((group, i2) => {
        const groupInteger = parseInt(group, 16);
        if (groupInteger === 0) {
          zeroIndexes.push(i2);
        }
      });
      const possibilities = zeroIndexes.map((zeroIndex) => groups.map((group, i2) => {
        if (i2 === zeroIndex) {
          const elision = i2 === 0 || i2 === v6.GROUPS - 1 ? ":" : "";
          return groupPossibilities([padGroup(group), elision]);
        }
        return padGroup(group);
      }).join(":"));
      possibilities.push(groups.map(padGroup).join(":"));
      return groupPossibilities(possibilities);
    }
    function possibleElisions(elidedGroups, moreLeft, moreRight) {
      const left = moreLeft ? "" : ":";
      const right = moreRight ? "" : ":";
      const possibilities = [];
      if (!moreLeft && !moreRight) {
        possibilities.push("::");
      }
      if (moreLeft && moreRight) {
        possibilities.push("");
      }
      if (moreRight && !moreLeft || !moreRight && moreLeft) {
        possibilities.push(":");
      }
      possibilities.push(`${left}(:0{1,4}){1,${elidedGroups - 1}}`);
      possibilities.push(`(0{1,4}:){1,${elidedGroups - 1}}${right}`);
      possibilities.push(`(0{1,4}:){${elidedGroups - 1}}0{1,4}`);
      for (let groups = 1; groups < elidedGroups - 1; groups++) {
        for (let position = 1; position < elidedGroups - groups; position++) {
          possibilities.push(`(0{1,4}:){${position}}:(0{1,4}:){${elidedGroups - position - groups - 1}}0{1,4}`);
        }
      }
      return groupPossibilities(possibilities);
    }
  }
});

// node_modules/ip-address/dist/ipv6.js
var require_ipv6 = __commonJS({
  "node_modules/ip-address/dist/ipv6.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m2, k);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m2[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.Address6 = void 0;
    var common = __importStar(require_common());
    var constants4 = __importStar(require_constants());
    var constants6 = __importStar(require_constants2());
    var helpers = __importStar(require_helpers());
    var ipv4_1 = require_ipv4();
    var regular_expressions_1 = require_regular_expressions();
    var address_error_1 = require_address_error();
    var common_1 = require_common();
    var isCorrect6 = common.isCorrect(constants6.BITS);
    function assert(condition) {
      if (!condition) {
        throw new Error("Assertion failed.");
      }
    }
    function addCommas(number) {
      const r2 = /(\d+)(\d{3})/;
      while (r2.test(number)) {
        number = number.replace(r2, "$1,$2");
      }
      return number;
    }
    function spanLeadingZeroes4(n) {
      n = n.replace(/^(0{1,})([1-9]+)$/, '<span class="parse-error">$1</span>$2');
      n = n.replace(/^(0{1,})(0)$/, '<span class="parse-error">$1</span>$2');
      return n;
    }
    function compact(address, slice) {
      const s1 = [];
      const s2 = [];
      let i2;
      for (i2 = 0; i2 < address.length; i2++) {
        if (i2 < slice[0]) {
          s1.push(address[i2]);
        } else if (i2 > slice[1]) {
          s2.push(address[i2]);
        }
      }
      return s1.concat(["compact"]).concat(s2);
    }
    function paddedHex(octet) {
      return parseInt(octet, 16).toString(16).padStart(4, "0");
    }
    function unsignByte(b) {
      return b & 255;
    }
    var Address62 = class _Address6 {
      constructor(address, optionalGroups) {
        this.addressMinusSuffix = "";
        this.parsedSubnet = "";
        this.subnet = "/128";
        this.subnetMask = 128;
        this.v4 = false;
        this.zone = "";
        this.isInSubnet = common.isInSubnet;
        this.isCorrect = isCorrect6;
        if (optionalGroups === void 0) {
          this.groups = constants6.GROUPS;
        } else {
          this.groups = optionalGroups;
        }
        this.address = address;
        const subnet = constants6.RE_SUBNET_STRING.exec(address);
        if (subnet) {
          this.parsedSubnet = subnet[0].replace("/", "");
          this.subnetMask = parseInt(this.parsedSubnet, 10);
          this.subnet = `/${this.subnetMask}`;
          if (Number.isNaN(this.subnetMask) || this.subnetMask < 0 || this.subnetMask > constants6.BITS) {
            throw new address_error_1.AddressError("Invalid subnet mask.");
          }
          address = address.replace(constants6.RE_SUBNET_STRING, "");
        } else if (/\//.test(address)) {
          throw new address_error_1.AddressError("Invalid subnet mask.");
        }
        const zone = constants6.RE_ZONE_STRING.exec(address);
        if (zone) {
          this.zone = zone[0];
          address = address.replace(constants6.RE_ZONE_STRING, "");
        }
        this.addressMinusSuffix = address;
        this.parsedAddress = this.parse(this.addressMinusSuffix);
      }
      /**
       * Returns true if the given string is a valid IPv6 address (with optional
       * CIDR subnet and zone identifier), false otherwise. Host bits in the
       * subnet portion are allowed (e.g. `2001:db8::1/32` is valid); for strict
       * network-address validation compare `correctForm()` to
       * `startAddress().correctForm()`, or use `networkForm()`.
       */
      static isValid(address) {
        try {
          new _Address6(address);
          return true;
        } catch (e2) {
          return false;
        }
      }
      /**
       * Convert a BigInt to a v6 address object. The value must be in the
       * range `[0, 2**128 - 1]`; otherwise `AddressError` is thrown.
       * @param {bigint} bigInt - a BigInt to convert
       * @returns {Address6}
       * @example
       * var bigInt = BigInt('1000000000000');
       * var address = Address6.fromBigInt(bigInt);
       * address.correctForm(); // '::e8:d4a5:1000'
       */
      static fromBigInt(bigInt) {
        if (bigInt < 0n || bigInt > (1n << BigInt(constants6.BITS)) - 1n) {
          throw new address_error_1.AddressError("IPv6 BigInt must be in the range 0 to 2**128 - 1");
        }
        const hex = bigInt.toString(16).padStart(32, "0");
        const groups = [];
        for (let i2 = 0; i2 < constants6.GROUPS; i2++) {
          groups.push(hex.slice(i2 * 4, (i2 + 1) * 4));
        }
        return new _Address6(groups.join(":"));
      }
      /**
       * Parse a URL (with optional bracketed host and port) into an address and
       * port. Returns either `{ address, port }` on success or
       * `{ error, address: null, port: null }` if the URL could not be parsed.
       * Ports are returned as numbers (or `null` if absent or out of range).
       * @example
       * var addressAndPort = Address6.fromURL('http://[ffff::]:8080/foo/');
       * addressAndPort.address.correctForm(); // 'ffff::'
       * addressAndPort.port; // 8080
       */
      static fromURL(url) {
        let host;
        let port = null;
        let result;
        if (url.indexOf("[") !== -1 && url.indexOf("]:") !== -1) {
          result = constants6.RE_URL_WITH_PORT.exec(url);
          if (result === null) {
            return {
              error: "failed to parse address with port",
              address: null,
              port: null
            };
          }
          host = result[1];
          port = result[2];
        } else if (url.indexOf("/") !== -1) {
          url = url.replace(/^[a-z0-9]+:\/\//, "");
          result = constants6.RE_URL.exec(url);
          if (result === null) {
            return {
              error: "failed to parse address from URL",
              address: null,
              port: null
            };
          }
          host = result[1];
        } else {
          host = url;
        }
        if (port) {
          port = parseInt(port, 10);
          if (port < 0 || port > 65536) {
            port = null;
          }
        } else {
          port = null;
        }
        return {
          address: new _Address6(host),
          port
        };
      }
      /**
       * Construct an `Address6` from an address and a hex subnet mask given as
       * separate strings (e.g. as returned by Node's `os.networkInterfaces()`).
       * Throws `AddressError` if the mask is non-contiguous (e.g.
       * `ffff::ffff`).
       * @example
       * var address = Address6.fromAddressAndMask('fe80::1', 'ffff:ffff:ffff:ffff::');
       * address.subnetMask; // 64
       */
      static fromAddressAndMask(address, mask) {
        const bits = common.prefixLengthFromMask(new _Address6(mask).bigInt(), constants6.BITS);
        return new _Address6(`${address}/${bits}`);
      }
      /**
       * Construct an `Address6` from an address and a Cisco-style wildcard mask
       * given as separate strings (e.g. `::ffff:ffff:ffff:ffff` for a `/64`).
       * The wildcard mask is the bitwise inverse of the subnet mask. Throws
       * `AddressError` if the mask is non-contiguous.
       * @example
       * var address = Address6.fromAddressAndWildcardMask('fe80::1', '::ffff:ffff:ffff:ffff');
       * address.subnetMask; // 64
       */
      static fromAddressAndWildcardMask(address, wildcardMask) {
        const wildcard = new _Address6(wildcardMask).bigInt();
        const allOnes = (BigInt(1) << BigInt(constants6.BITS)) - BigInt(1);
        const mask = wildcard ^ allOnes;
        const bits = common.prefixLengthFromMask(mask, constants6.BITS);
        return new _Address6(`${address}/${bits}`);
      }
      /**
       * Construct an `Address6` from a wildcard pattern with trailing `*`
       * groups. The number of trailing wildcards determines the prefix
       * length: each `*` represents 16 bits. `::` is expanded to zero groups
       * (not wildcards) before evaluating trailing wildcards.
       *
       * Only trailing whole-group wildcards are supported. Partial-group
       * wildcards (e.g. `2001:db8::0*`) and interior wildcards (e.g.
       * `*::1`) throw `AddressError`.
       * @example
       * Address6.fromWildcard('2001:db8:*:*:*:*:*:*').subnet;  // '/32'
       * Address6.fromWildcard('2001:db8::*').subnet;           // '/112'
       * Address6.fromWildcard('*:*:*:*:*:*:*:*').subnet;       // '/0'
       */
      static fromWildcard(input) {
        if (input.includes("%") || input.includes("/")) {
          throw new address_error_1.AddressError("Wildcard pattern must not include a zone or CIDR suffix");
        }
        const halves = input.split("::");
        if (halves.length > 2) {
          throw new address_error_1.AddressError("Wildcard pattern cannot contain more than one '::'");
        }
        let groups;
        if (halves.length === 2) {
          const left = halves[0] === "" ? [] : halves[0].split(":");
          const right = halves[1] === "" ? [] : halves[1].split(":");
          const remaining = constants6.GROUPS - left.length - right.length;
          if (remaining < 1) {
            throw new address_error_1.AddressError("Wildcard pattern with '::' has too many groups");
          }
          groups = [...left, ...new Array(remaining).fill("0"), ...right];
        } else {
          groups = input.split(":");
        }
        if (groups.length !== constants6.GROUPS) {
          throw new address_error_1.AddressError("Wildcard pattern must have 8 groups");
        }
        let firstWildcard = -1;
        for (let i2 = 0; i2 < groups.length; i2++) {
          if (groups[i2] === "*") {
            if (firstWildcard === -1) {
              firstWildcard = i2;
            }
          } else if (firstWildcard !== -1) {
            throw new address_error_1.AddressError("Wildcard `*` must only appear in trailing groups (e.g. `2001:db8:*:*:*:*:*:*`)");
          }
        }
        const trailing = firstWildcard === -1 ? 0 : groups.length - firstWildcard;
        const replaced = groups.map((g) => g === "*" ? "0" : g);
        const subnetBits = constants6.BITS - trailing * 16;
        return new _Address6(`${replaced.join(":")}/${subnetBits}`);
      }
      /**
       * Create an IPv6-mapped address given an IPv4 address
       * @param {string} address - An IPv4 address string
       * @returns {Address6}
       * @example
       * var address = Address6.fromAddress4('192.168.0.1');
       * address.correctForm(); // '::ffff:c0a8:1'
       * address.to4in6(); // '::ffff:192.168.0.1'
       */
      static fromAddress4(address) {
        const address4 = new ipv4_1.Address4(address);
        const mask6 = constants6.BITS - (constants4.BITS - address4.subnetMask);
        return new _Address6(`::ffff:${address4.correctForm()}/${mask6}`);
      }
      /**
       * Return an address from ip6.arpa form
       * @param {string} arpaFormAddress - an 'ip6.arpa' form address
       * @returns {Adress6}
       * @example
       * var address = Address6.fromArpa(e.f.f.f.3.c.2.6.f.f.f.e.6.6.8.e.1.0.6.7.9.4.e.c.0.0.0.0.1.0.0.2.ip6.arpa.)
       * address.correctForm(); // '2001:0:ce49:7601:e866:efff:62c3:fffe'
       */
      static fromArpa(arpaFormAddress) {
        let address = arpaFormAddress.replace(/(\.ip6\.arpa)?\.$/, "");
        const semicolonAmount = 7;
        if (address.length !== 63) {
          throw new address_error_1.AddressError("Invalid 'ip6.arpa' form.");
        }
        const parts = address.split(".").reverse();
        for (let i2 = semicolonAmount; i2 > 0; i2--) {
          const insertIndex = i2 * 4;
          parts.splice(insertIndex, 0, ":");
        }
        address = parts.join("");
        return new _Address6(address);
      }
      /**
       * Return the Microsoft UNC transcription of the address
       * @returns {String} the Microsoft UNC transcription of the address
       */
      microsoftTranscription() {
        return `${this.correctForm().replace(/:/g, "-")}.ipv6-literal.net`;
      }
      /**
       * Return the first n bits of the address, defaulting to the subnet mask
       * @param {number} [mask=subnet] - the number of bits to mask
       * @returns {String} the first n bits of the address as a string
       */
      mask(mask = this.subnetMask) {
        return this.getBitsBase2(0, mask);
      }
      /**
       * Return the number of possible subnets of a given size in the address
       * @param {number} [subnetSize=128] - the subnet size
       * @returns {String}
       */
      // TODO: probably useful to have a numeric version of this too
      possibleSubnets(subnetSize = 128) {
        const availableBits = constants6.BITS - this.subnetMask;
        const subnetBits = Math.abs(subnetSize - constants6.BITS);
        const subnetPowers = availableBits - subnetBits;
        if (subnetPowers < 0) {
          return "0";
        }
        return addCommas((BigInt("2") ** BigInt(subnetPowers)).toString(10));
      }
      /**
       * Helper function getting start address.
       * @returns {bigint}
       */
      _startAddress() {
        return BigInt(`0b${this.mask() + "0".repeat(constants6.BITS - this.subnetMask)}`);
      }
      /**
       * The first address in the range given by this address' subnet
       * Often referred to as the Network Address.
       * @returns {Address6}
       */
      startAddress() {
        return _Address6.fromBigInt(this._startAddress());
      }
      /**
       * The first host address in the range given by this address's subnet ie
       * the first address after the Network Address
       * @returns {Address6}
       */
      startAddressExclusive() {
        const adjust = BigInt("1");
        return _Address6.fromBigInt(this._startAddress() + adjust);
      }
      /**
       * Helper function getting end address.
       * @returns {bigint}
       */
      _endAddress() {
        return BigInt(`0b${this.mask() + "1".repeat(constants6.BITS - this.subnetMask)}`);
      }
      /**
       * The last address in the range given by this address' subnet
       * Often referred to as the Broadcast
       * @returns {Address6}
       */
      endAddress() {
        return _Address6.fromBigInt(this._endAddress());
      }
      /**
       * The last host address in the range given by this address's subnet ie
       * the last address prior to the Broadcast Address
       * @returns {Address6}
       */
      endAddressExclusive() {
        const adjust = BigInt("1");
        return _Address6.fromBigInt(this._endAddress() - adjust);
      }
      /**
       * The hex form of the subnet mask, e.g. `ffff:ffff:ffff:ffff::` for a
       * `/64`. Returns an `Address6`; call `.correctForm()` for the string.
       * @returns {Address6}
       */
      subnetMaskAddress() {
        return _Address6.fromBigInt(BigInt(`0b${"1".repeat(this.subnetMask)}${"0".repeat(constants6.BITS - this.subnetMask)}`));
      }
      /**
       * The Cisco-style wildcard mask, e.g. `::ffff:ffff:ffff:ffff` for a
       * `/64`. This is the bitwise inverse of `subnetMaskAddress()`. Returns
       * an `Address6`; call `.correctForm()` for the string.
       * @returns {Address6}
       */
      wildcardMask() {
        return _Address6.fromBigInt(BigInt(`0b${"0".repeat(this.subnetMask)}${"1".repeat(constants6.BITS - this.subnetMask)}`));
      }
      /**
       * The network address in CIDR string form, e.g. `2001:db8::/32` for
       * `2001:db8::1/32`. For an address with no explicit subnet the prefix
       * is `/128`, e.g. `networkForm()` on `2001:db8::1` returns
       * `2001:db8::1/128`.
       * @returns {string}
       */
      networkForm() {
        return `${this.startAddress().correctForm()}/${this.subnetMask}`;
      }
      /**
       * Return the scope of the address. The 4-bit scope field
       * ([RFC 4291 §2.7](https://datatracker.ietf.org/doc/html/rfc4291#section-2.7))
       * is only defined for multicast addresses; for unicast addresses the scope
       * is derived from the address type per
       * [RFC 4007 §6](https://datatracker.ietf.org/doc/html/rfc4007#section-6).
       * @returns {String}
       */
      getScope() {
        const type = this.getType();
        if (type === "Multicast" || type.startsWith("Multicast ")) {
          const scope = constants6.SCOPES[parseInt(this.getBits(12, 16).toString(10), 10)];
          return scope || "Unknown";
        }
        if (type === "Link-local unicast" || type === "Loopback") {
          return "Link local";
        }
        if (type === "Unspecified") {
          return "Unknown";
        }
        return "Global";
      }
      /**
       * Return the type of the address
       * @returns {String}
       */
      getType() {
        for (let i2 = 0; i2 < TYPE_SUBNETS.length; i2++) {
          const entry = TYPE_SUBNETS[i2];
          if (this.isInSubnet(entry[0])) {
            return entry[1];
          }
        }
        return "Global unicast";
      }
      /**
       * Return the bits in the given range as a BigInt
       * @returns {bigint}
       */
      getBits(start, end) {
        return BigInt(`0b${this.getBitsBase2(start, end)}`);
      }
      /**
       * Return the bits in the given range as a base-2 string
       * @returns {String}
       */
      getBitsBase2(start, end) {
        return this.binaryZeroPad().slice(start, end);
      }
      /**
       * Return the bits in the given range as a base-16 string
       * @returns {String}
       */
      getBitsBase16(start, end) {
        const length = end - start;
        if (length % 4 !== 0) {
          throw new Error("Length of bits to retrieve must be divisible by four");
        }
        return this.getBits(start, end).toString(16).padStart(length / 4, "0");
      }
      /**
       * Return the bits that are set past the subnet mask length
       * @returns {String}
       */
      getBitsPastSubnet() {
        return this.getBitsBase2(this.subnetMask, constants6.BITS);
      }
      /**
       * Return the reversed ip6.arpa form of the address
       * @param {Object} options
       * @param {boolean} options.omitSuffix - omit the "ip6.arpa" suffix
       * @returns {String}
       */
      reverseForm(options) {
        if (!options) {
          options = {};
        }
        const characters = Math.floor(this.subnetMask / 4);
        const reversed = this.canonicalForm().replace(/:/g, "").split("").slice(0, characters).reverse().join(".");
        if (characters > 0) {
          if (options.omitSuffix) {
            return reversed;
          }
          return `${reversed}.ip6.arpa.`;
        }
        if (options.omitSuffix) {
          return "";
        }
        return "ip6.arpa.";
      }
      /**
       * Returns the address in correct form, per
       * [RFC 5952](https://datatracker.ietf.org/doc/html/rfc5952): leading zeros
       * stripped, the longest run of zero groups collapsed to `::`, and hex digits
       * lowercased (e.g. `2001:db8::1`). This is the recommended form for display.
       */
      correctForm() {
        let i2;
        let groups = [];
        let zeroCounter = 0;
        const zeroes = [];
        for (i2 = 0; i2 < this.parsedAddress.length; i2++) {
          const value = parseInt(this.parsedAddress[i2], 16);
          if (value === 0) {
            zeroCounter++;
          }
          if (value !== 0 && zeroCounter > 0) {
            if (zeroCounter > 1) {
              zeroes.push([i2 - zeroCounter, i2 - 1]);
            }
            zeroCounter = 0;
          }
        }
        if (zeroCounter > 1) {
          zeroes.push([this.parsedAddress.length - zeroCounter, this.parsedAddress.length - 1]);
        }
        const zeroLengths = zeroes.map((n) => n[1] - n[0] + 1);
        if (zeroes.length > 0) {
          const index = zeroLengths.indexOf(Math.max(...zeroLengths));
          groups = compact(this.parsedAddress, zeroes[index]);
        } else {
          groups = this.parsedAddress;
        }
        for (i2 = 0; i2 < groups.length; i2++) {
          if (groups[i2] !== "compact") {
            groups[i2] = parseInt(groups[i2], 16).toString(16);
          }
        }
        let correct = groups.join(":");
        correct = correct.replace(/^compact$/, "::");
        correct = correct.replace(/(^compact)|(compact$)/, ":");
        correct = correct.replace(/compact/, "");
        return correct;
      }
      /**
       * Return a zero-padded base-2 string representation of the address
       * @returns {String}
       * @example
       * var address = new Address6('2001:4860:4001:803::1011');
       * address.binaryZeroPad();
       * // '0010000000000001010010000110000001000000000000010000100000000011
       * //  0000000000000000000000000000000000000000000000000001000000010001'
       */
      binaryZeroPad() {
        if (this._binaryZeroPad === void 0) {
          this._binaryZeroPad = this.bigInt().toString(2).padStart(constants6.BITS, "0");
        }
        return this._binaryZeroPad;
      }
      /**
       * Parses a v4-in-v6 string (e.g. `::ffff:192.168.0.1`) by extracting the
       * trailing IPv4 address into `this.address4` / `this.parsedAddress4` and
       * returning the address with the v4 portion converted to two v6 groups.
       * Used internally by `parse()`.
       */
      // TODO: Improve the semantics of this helper function
      parse4in6(address) {
        if (address.indexOf(".") === -1) {
          return address;
        }
        const groups = address.split(":");
        const lastGroup = groups.slice(-1)[0];
        const address4 = lastGroup.match(constants4.RE_ADDRESS);
        if (address4) {
          this.parsedAddress4 = address4[0];
          this.address4 = new ipv4_1.Address4(this.parsedAddress4);
          for (let i2 = 0; i2 < this.address4.groups; i2++) {
            if (/^0[0-9]+/.test(this.address4.parsedAddress[i2])) {
              const highlighted = this.address4.parsedAddress.map(spanLeadingZeroes4).join(".");
              const prefix = groups.slice(0, -1).map(helpers.escapeHtml).join(":");
              const separator = groups.length > 1 ? ":" : "";
              throw new address_error_1.AddressError("IPv4 addresses can't have leading zeroes.", `${prefix}${separator}${highlighted}`);
            }
          }
          this.v4 = true;
          groups[groups.length - 1] = this.address4.toGroup6();
          address = groups.join(":");
        }
        return address;
      }
      /**
       * Parses an IPv6 address string into its 8 hexadecimal groups (expanding
       * any `::` elision and any trailing v4-in-v6 portion) and stores the result
       * on `this.parsedAddress`. Called automatically by the constructor; you
       * typically don't need to call it directly. Throws `AddressError` if the
       * input is malformed.
       */
      // TODO: Make private?
      parse(address) {
        address = this.parse4in6(address);
        const badCharacters = address.match(constants6.RE_BAD_CHARACTERS);
        if (badCharacters) {
          throw new address_error_1.AddressError(`Bad character${badCharacters.length > 1 ? "s" : ""} detected in address: ${badCharacters.join("")}`, address.replace(constants6.RE_BAD_CHARACTERS, '<span class="parse-error">$1</span>'));
        }
        const badAddress = address.match(constants6.RE_BAD_ADDRESS);
        if (badAddress) {
          throw new address_error_1.AddressError(`Address failed regex: ${badAddress.join("")}`, address.replace(constants6.RE_BAD_ADDRESS, '<span class="parse-error">$1</span>'));
        }
        let groups = [];
        const halves = address.split("::");
        if (halves.length === 2) {
          let first = halves[0].split(":");
          let last = halves[1].split(":");
          if (first.length === 1 && first[0] === "") {
            first = [];
          }
          if (last.length === 1 && last[0] === "") {
            last = [];
          }
          const remaining = this.groups - (first.length + last.length);
          if (!remaining) {
            throw new address_error_1.AddressError("Error parsing groups");
          }
          this.elidedGroups = remaining;
          this.elisionBegin = first.length;
          this.elisionEnd = first.length + this.elidedGroups;
          groups = groups.concat(first);
          for (let i2 = 0; i2 < remaining; i2++) {
            groups.push("0");
          }
          groups = groups.concat(last);
        } else if (halves.length === 1) {
          groups = address.split(":");
          this.elidedGroups = 0;
        } else {
          throw new address_error_1.AddressError("Too many :: groups found");
        }
        groups = groups.map((group) => parseInt(group, 16).toString(16));
        if (groups.length !== this.groups) {
          throw new address_error_1.AddressError("Incorrect number of groups found");
        }
        return groups;
      }
      /**
       * Returns the canonical (fully expanded) form of the address: all 8 groups,
       * each padded to 4 hex digits, with no `::` collapsing
       * (e.g. `2001:0db8:0000:0000:0000:0000:0000:0001`). Useful for sorting and
       * byte-exact comparison.
       */
      canonicalForm() {
        return this.parsedAddress.map(paddedHex).join(":");
      }
      /**
       * Return the decimal form of the address
       * @returns {String}
       */
      decimal() {
        return this.parsedAddress.map((n) => parseInt(n, 16).toString(10).padStart(5, "0")).join(":");
      }
      /**
       * Return the address as a BigInt
       * @returns {bigint}
       */
      bigInt() {
        return BigInt(`0x${this.parsedAddress.map(paddedHex).join("")}`);
      }
      /**
       * Return the last two groups of this address as an IPv4 address string
       * @returns {Address4}
       * @example
       * var address = new Address6('2001:4860:4001::1825:bf11');
       * address.to4().correctForm(); // '24.37.191.17'
       */
      to4() {
        const binary = this.binaryZeroPad().split("");
        return ipv4_1.Address4.fromHex(BigInt(`0b${binary.slice(96, 128).join("")}`).toString(16).padStart(8, "0"));
      }
      /**
       * Return the v4-in-v6 form of the address
       * @returns {String}
       */
      to4in6() {
        const address4 = this.to4();
        const address6 = new _Address6(this.parsedAddress.slice(0, 6).join(":"), 6);
        const correct = address6.correctForm();
        let infix = "";
        if (!/:$/.test(correct)) {
          infix = ":";
        }
        return correct + infix + address4.address;
      }
      /**
       * Decodes the Teredo tunneling fields embedded in this address. Returns the
       * Teredo prefix, server IPv4, client IPv4, raw flag bits, cone-NAT flag,
       * UDP port, and Microsoft-format flag breakdown (reserved, universal/local,
       * group/individual, nonce). Only meaningful for addresses in `2001::/32`.
       */
      inspectTeredo() {
        const prefix = this.getBitsBase16(0, 32);
        const bitsForUdpPort = this.getBits(80, 96);
        const udpPort = (bitsForUdpPort ^ BigInt("0xffff")).toString();
        const server4 = ipv4_1.Address4.fromHex(this.getBitsBase16(32, 64));
        const bitsForClient4 = this.getBits(96, 128);
        const client4 = ipv4_1.Address4.fromHex((bitsForClient4 ^ BigInt("0xffffffff")).toString(16).padStart(8, "0"));
        const flagsBase2 = this.getBitsBase2(64, 80);
        const coneNat = (0, common_1.testBit)(flagsBase2, 15);
        const reserved = (0, common_1.testBit)(flagsBase2, 14);
        const groupIndividual = (0, common_1.testBit)(flagsBase2, 8);
        const universalLocal = (0, common_1.testBit)(flagsBase2, 9);
        const nonce = BigInt(`0b${flagsBase2.slice(2, 6) + flagsBase2.slice(8, 16)}`).toString(10);
        return {
          prefix: `${prefix.slice(0, 4)}:${prefix.slice(4, 8)}`,
          server4: server4.address,
          client4: client4.address,
          flags: flagsBase2,
          coneNat,
          microsoft: {
            reserved,
            universalLocal,
            groupIndividual,
            nonce
          },
          udpPort
        };
      }
      /**
       * Decodes the 6to4 tunneling fields embedded in this address. Returns the
       * 6to4 prefix and the embedded IPv4 gateway address. Only meaningful for
       * addresses in `2002::/16`.
       */
      inspect6to4() {
        const prefix = this.getBitsBase16(0, 16);
        const gateway = ipv4_1.Address4.fromHex(this.getBitsBase16(16, 48));
        return {
          prefix: prefix.slice(0, 4),
          gateway: gateway.address
        };
      }
      /**
       * Return a v6 6to4 address from a v6 v4inv6 address
       * @returns {Address6}
       */
      to6to4() {
        if (!this.is4()) {
          return null;
        }
        const addr6to4 = [
          "2002",
          this.getBitsBase16(96, 112),
          this.getBitsBase16(112, 128),
          "",
          "/16"
        ].join(":");
        return new _Address6(addr6to4);
      }
      /**
       * Embed an IPv4 address into a NAT64 IPv6 address using the encoding
       * defined by [RFC 6052](https://datatracker.ietf.org/doc/html/rfc6052).
       * The default prefix is the well-known prefix `64:ff9b::/96`. The prefix
       * length must be one of 32, 40, 48, 56, 64, or 96; for prefixes shorter
       * than /64 the IPv4 octets are split around the reserved bits 64–71.
       * @example
       * Address6.fromAddress4Nat64('192.0.2.33').correctForm(); // '64:ff9b::c000:221'
       * Address6.fromAddress4Nat64('192.0.2.33', '2001:db8::/32').correctForm(); // '2001:db8:c000:221::'
       */
      static fromAddress4Nat64(address, prefix = "64:ff9b::/96") {
        const v4 = new ipv4_1.Address4(address);
        const prefix6 = new _Address6(prefix);
        const pl = prefix6.subnetMask;
        if (pl !== 32 && pl !== 40 && pl !== 48 && pl !== 56 && pl !== 64 && pl !== 96) {
          throw new address_error_1.AddressError("NAT64 prefix length must be 32, 40, 48, 56, 64, or 96");
        }
        const prefixBits = prefix6.binaryZeroPad();
        const v4Bits = v4.binaryZeroPad();
        let bits;
        if (pl === 96) {
          bits = prefixBits.slice(0, 96) + v4Bits;
        } else {
          const beforeU = 64 - pl;
          bits = prefixBits.slice(0, pl) + v4Bits.slice(0, beforeU) + "00000000" + v4Bits.slice(beforeU) + "0".repeat(128 - 72 - (32 - beforeU));
        }
        const hex = BigInt(`0b${bits}`).toString(16).padStart(32, "0");
        const groups = [];
        for (let i2 = 0; i2 < 8; i2++) {
          groups.push(hex.slice(i2 * 4, (i2 + 1) * 4));
        }
        return new _Address6(groups.join(":"));
      }
      /**
       * Extract the embedded IPv4 address from a NAT64 IPv6 address using the
       * encoding defined by [RFC 6052](https://datatracker.ietf.org/doc/html/rfc6052).
       * The default prefix is the well-known prefix `64:ff9b::/96`. Returns
       * `null` if this address is not contained within the given prefix.
       * @example
       * new Address6('64:ff9b::c000:221').toAddress4Nat64()!.correctForm(); // '192.0.2.33'
       */
      toAddress4Nat64(prefix = "64:ff9b::/96") {
        const prefix6 = new _Address6(prefix);
        const pl = prefix6.subnetMask;
        if (pl !== 32 && pl !== 40 && pl !== 48 && pl !== 56 && pl !== 64 && pl !== 96) {
          throw new address_error_1.AddressError("NAT64 prefix length must be 32, 40, 48, 56, 64, or 96");
        }
        if (!this.isInSubnet(prefix6)) {
          return null;
        }
        const bits = this.binaryZeroPad();
        let v4Bits;
        if (pl === 96) {
          v4Bits = bits.slice(96, 128);
        } else {
          const beforeU = 64 - pl;
          v4Bits = bits.slice(pl, pl + beforeU) + bits.slice(72, 72 + (32 - beforeU));
        }
        const octets = [];
        for (let i2 = 0; i2 < 4; i2++) {
          octets.push(parseInt(v4Bits.slice(i2 * 8, (i2 + 1) * 8), 2).toString());
        }
        return new ipv4_1.Address4(octets.join("."));
      }
      /**
       * Return a byte array.
       *
       * To get a Node.js `Buffer`, wrap the result: `Buffer.from(address.toByteArray())`.
       * @returns {Array}
       */
      toByteArray() {
        const valueWithoutPadding = this.bigInt().toString(16);
        const leadingPad = "0".repeat(valueWithoutPadding.length % 2);
        const value = `${leadingPad}${valueWithoutPadding}`;
        const bytes = [];
        for (let i2 = 0, length = value.length; i2 < length; i2 += 2) {
          bytes.push(parseInt(value.substring(i2, i2 + 2), 16));
        }
        return bytes;
      }
      /**
       * Return an unsigned byte array.
       *
       * To get a Node.js `Buffer`, wrap the result: `Buffer.from(address.toUnsignedByteArray())`.
       * @returns {Array}
       */
      toUnsignedByteArray() {
        return this.toByteArray().map(unsignByte);
      }
      /**
       * Convert a byte array to an Address6 object.
       *
       * To convert from a Node.js `Buffer`, spread it: `Address6.fromByteArray([...buf])`.
       * @returns {Address6}
       */
      static fromByteArray(bytes) {
        return this.fromUnsignedByteArray(bytes.map(unsignByte));
      }
      /**
       * Convert an unsigned byte array to an Address6 object.
       *
       * To convert from a Node.js `Buffer`, spread it: `Address6.fromUnsignedByteArray([...buf])`.
       * @returns {Address6}
       */
      static fromUnsignedByteArray(bytes) {
        const BYTE_MAX = BigInt("256");
        let result = BigInt("0");
        let multiplier = BigInt("1");
        for (let i2 = bytes.length - 1; i2 >= 0; i2--) {
          result += multiplier * BigInt(bytes[i2].toString(10));
          multiplier *= BYTE_MAX;
        }
        return _Address6.fromBigInt(result);
      }
      /**
       * Returns true if the address is in the canonical form, false otherwise
       * @returns {boolean}
       */
      isCanonical() {
        return this.addressMinusSuffix === this.canonicalForm();
      }
      /**
       * Returns true if the address is a link local address, false otherwise
       * @returns {boolean}
       */
      isLinkLocal() {
        if (this.getBitsBase2(0, 64) === "1111111010000000000000000000000000000000000000000000000000000000") {
          return true;
        }
        return false;
      }
      /**
       * Returns true if the address is a multicast address, false otherwise
       * @returns {boolean}
       */
      isMulticast() {
        const type = this.getType();
        return type === "Multicast" || type.startsWith("Multicast ");
      }
      /**
       * Returns true if the address was written in v4-in-v6 dotted-quad notation
       * (e.g. `::ffff:127.0.0.1`), false otherwise. This is a notation-level flag
       * and does not reflect whether the address bits lie in the IPv4-mapped
       * (`::ffff:0:0/96`) subnet — for that, see {@link isMapped4}.
       * @returns {boolean}
       */
      is4() {
        return this.v4;
      }
      /**
       * Returns true if the address is an IPv4-mapped IPv6 address in
       * `::ffff:0:0/96` ([RFC 4291 §2.5.5.2](https://datatracker.ietf.org/doc/html/rfc4291#section-2.5.5.2)),
       * false otherwise. Unlike {@link is4}, this checks the underlying address
       * bits rather than the textual notation, so `::ffff:127.0.0.1` and
       * `::ffff:7f00:1` both return true.
       * @returns {boolean}
       */
      isMapped4() {
        return this.isInSubnet(IPV4_MAPPED_SUBNET);
      }
      /**
       * Returns true if the address is a Teredo address, false otherwise
       * @returns {boolean}
       */
      isTeredo() {
        return this.isInSubnet(TEREDO_SUBNET);
      }
      /**
       * Returns true if the address is a 6to4 address, false otherwise
       * @returns {boolean}
       */
      is6to4() {
        return this.isInSubnet(SIX_TO_FOUR_SUBNET);
      }
      /**
       * Returns true if the address is a loopback address, false otherwise
       * @returns {boolean}
       */
      isLoopback() {
        return this.getType() === "Loopback";
      }
      /**
       * Returns true if the address is a Unique Local Address in `fc00::/7` ([RFC 4193](https://datatracker.ietf.org/doc/html/rfc4193)). ULAs are the IPv6 equivalent of IPv4 [RFC 1918](https://datatracker.ietf.org/doc/html/rfc1918) private addresses.
       * @returns {boolean}
       */
      isULA() {
        return this.isInSubnet(ULA_SUBNET);
      }
      /**
       * Returns true if the address is the unspecified address `::`.
       * @returns {boolean}
       */
      isUnspecified() {
        return this.getType() === "Unspecified";
      }
      /**
       * Returns true if the address is in the documentation prefix `2001:db8::/32` ([RFC 3849](https://datatracker.ietf.org/doc/html/rfc3849)).
       * @returns {boolean}
       */
      isDocumentation() {
        return this.isInSubnet(DOCUMENTATION_SUBNET);
      }
      // #endregion
      // #region HTML
      /**
       * Returns the address as an HTTP URL with the host bracketed, e.g.
       * `http://[2001:db8::1]/`. If `optionalPort` is provided it is appended,
       * e.g. `http://[2001:db8::1]:8080/`.
       */
      href(optionalPort) {
        if (optionalPort === void 0) {
          optionalPort = "";
        } else {
          optionalPort = `:${optionalPort}`;
        }
        return `http://[${this.correctForm()}]${optionalPort}/`;
      }
      /**
       * Returns an HTML `<a>` element whose `href` encodes the address in a URL
       * hash fragment (default prefix `/#address=`). Useful for linking between
       * pages of an address-inspector UI.
       * @param options.className - CSS class for the rendered `<a>` element
       * @param options.prefix - hash prefix prepended to the address (default `/#address=`)
       * @param options.v4 - when true, render the address in v4-in-v6 form
       */
      link(options) {
        if (!options) {
          options = {};
        }
        if (options.className === void 0) {
          options.className = "";
        }
        if (options.prefix === void 0) {
          options.prefix = "/#address=";
        }
        if (options.v4 === void 0) {
          options.v4 = false;
        }
        let formFunction = this.correctForm;
        if (options.v4) {
          formFunction = this.to4in6;
        }
        const form = formFunction.call(this);
        const safeHref = helpers.escapeHtml(`${options.prefix}${form}`);
        const safeForm = helpers.escapeHtml(form);
        if (options.className) {
          const safeClass = helpers.escapeHtml(options.className);
          return `<a href="${safeHref}" class="${safeClass}">${safeForm}</a>`;
        }
        return `<a href="${safeHref}">${safeForm}</a>`;
      }
      /**
       * Groups an address
       * @returns {String}
       */
      group() {
        if (this.elidedGroups === 0) {
          return helpers.simpleGroup(this.addressMinusSuffix).join(":");
        }
        assert(typeof this.elidedGroups === "number");
        assert(typeof this.elisionBegin === "number");
        const output = [];
        const [left, right] = this.addressMinusSuffix.split("::");
        if (left.length) {
          output.push(...helpers.simpleGroup(left));
        } else {
          output.push("");
        }
        const classes = ["hover-group"];
        for (let i2 = this.elisionBegin; i2 < this.elisionBegin + this.elidedGroups; i2++) {
          classes.push(`group-${i2}`);
        }
        output.push(`<span class="${classes.join(" ")}"></span>`);
        if (right.length) {
          output.push(...helpers.simpleGroup(right, this.elisionEnd));
        } else {
          output.push("");
        }
        if (this.is4()) {
          assert(this.address4 instanceof ipv4_1.Address4);
          output.pop();
          output.push(this.address4.groupForV6());
        }
        return output.join(":");
      }
      // #endregion
      // #region Regular expressions
      /**
       * Generate a regular expression string that can be used to find or validate
       * all variations of this address
       * @param {boolean} substringSearch
       * @returns {string}
       */
      regularExpressionString(substringSearch = false) {
        let output = [];
        const address6 = new _Address6(this.correctForm());
        if (address6.elidedGroups === 0) {
          output.push((0, regular_expressions_1.simpleRegularExpression)(address6.parsedAddress));
        } else if (address6.elidedGroups === constants6.GROUPS) {
          output.push((0, regular_expressions_1.possibleElisions)(constants6.GROUPS));
        } else {
          const halves = address6.address.split("::");
          if (halves[0].length) {
            output.push((0, regular_expressions_1.simpleRegularExpression)(halves[0].split(":")));
          }
          assert(typeof address6.elidedGroups === "number");
          output.push((0, regular_expressions_1.possibleElisions)(address6.elidedGroups, halves[0].length !== 0, halves[1].length !== 0));
          if (halves[1].length) {
            output.push((0, regular_expressions_1.simpleRegularExpression)(halves[1].split(":")));
          }
          output = [output.join(":")];
        }
        if (!substringSearch) {
          output = [
            "(?=^|",
            regular_expressions_1.ADDRESS_BOUNDARY,
            "|[^\\w\\:])(",
            ...output,
            ")(?=[^\\w\\:]|",
            regular_expressions_1.ADDRESS_BOUNDARY,
            "|$)"
          ];
        }
        return output.join("");
      }
      /**
       * Generate a regular expression that can be used to find or validate all
       * variations of this address.
       * @param {boolean} substringSearch
       * @returns {RegExp}
       */
      regularExpression(substringSearch = false) {
        return new RegExp(this.regularExpressionString(substringSearch), "i");
      }
    };
    exports2.Address6 = Address62;
    var TYPE_SUBNETS = Object.keys(constants6.TYPES).map((subnet) => [
      new Address62(subnet),
      constants6.TYPES[subnet]
    ]);
    var TEREDO_SUBNET = new Address62("2001::/32");
    var SIX_TO_FOUR_SUBNET = new Address62("2002::/16");
    var ULA_SUBNET = new Address62("fc00::/7");
    var DOCUMENTATION_SUBNET = new Address62("2001:db8::/32");
    var IPV4_MAPPED_SUBNET = new Address62("::ffff:0:0/96");
  }
});

// node_modules/ip-address/dist/ip-address.js
var require_ip_address = __commonJS({
  "node_modules/ip-address/dist/ip-address.js"(exports2) {
    "use strict";
    var __createBinding = exports2 && exports2.__createBinding || (Object.create ? (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m2, k);
      if (!desc || ("get" in desc ? !m2.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m2[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m2, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m2[k];
    }));
    var __setModuleDefault = exports2 && exports2.__setModuleDefault || (Object.create ? (function(o, v) {
      Object.defineProperty(o, "default", { enumerable: true, value: v });
    }) : function(o, v) {
      o["default"] = v;
    });
    var __importStar = exports2 && exports2.__importStar || function(mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) {
        for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
      }
      __setModuleDefault(result, mod);
      return result;
    };
    Object.defineProperty(exports2, "__esModule", { value: true });
    exports2.v6 = exports2.AddressError = exports2.Address6 = exports2.Address4 = void 0;
    var ipv4_1 = require_ipv4();
    Object.defineProperty(exports2, "Address4", { enumerable: true, get: function() {
      return ipv4_1.Address4;
    } });
    var ipv6_1 = require_ipv6();
    Object.defineProperty(exports2, "Address6", { enumerable: true, get: function() {
      return ipv6_1.Address6;
    } });
    var address_error_1 = require_address_error();
    Object.defineProperty(exports2, "AddressError", { enumerable: true, get: function() {
      return address_error_1.AddressError;
    } });
    var helpers = __importStar(require_helpers());
    exports2.v6 = { helpers };
  }
});

// node_modules/data-uri-to-buffer/dist/index.js
function dataUriToBuffer(uri) {
  if (!/^data:/i.test(uri)) {
    throw new TypeError('`uri` does not appear to be a Data URI (must begin with "data:")');
  }
  uri = uri.replace(/\r?\n/g, "");
  const firstComma = uri.indexOf(",");
  if (firstComma === -1 || firstComma <= 4) {
    throw new TypeError("malformed data: URI");
  }
  const meta = uri.substring(5, firstComma).split(";");
  let charset = "";
  let base64 = false;
  const type = meta[0] || "text/plain";
  let typeFull = type;
  for (let i2 = 1; i2 < meta.length; i2++) {
    if (meta[i2] === "base64") {
      base64 = true;
    } else if (meta[i2]) {
      typeFull += `;${meta[i2]}`;
      if (meta[i2].indexOf("charset=") === 0) {
        charset = meta[i2].substring(8);
      }
    }
  }
  if (!meta[0] && !charset.length) {
    typeFull += ";charset=US-ASCII";
    charset = "US-ASCII";
  }
  const encoding = base64 ? "base64" : "ascii";
  const data = unescape(uri.substring(firstComma + 1));
  const buffer = Buffer.from(data, encoding);
  buffer.type = type;
  buffer.typeFull = typeFull;
  buffer.charset = charset;
  return buffer;
}
var dist_default;
var init_dist = __esm({
  "node_modules/data-uri-to-buffer/dist/index.js"() {
    dist_default = dataUriToBuffer;
  }
});

// node_modules/web-streams-polyfill/dist/ponyfill.es2018.js
var require_ponyfill_es2018 = __commonJS({
  "node_modules/web-streams-polyfill/dist/ponyfill.es2018.js"(exports2, module2) {
    (function(global2, factory) {
      typeof exports2 === "object" && typeof module2 !== "undefined" ? factory(exports2) : typeof define === "function" && define.amd ? define(["exports"], factory) : (global2 = typeof globalThis !== "undefined" ? globalThis : global2 || self, factory(global2.WebStreamsPolyfill = {}));
    })(exports2, (function(exports3) {
      "use strict";
      function noop2() {
        return void 0;
      }
      function typeIsObject(x2) {
        return typeof x2 === "object" && x2 !== null || typeof x2 === "function";
      }
      const rethrowAssertionErrorRejection = noop2;
      function setFunctionName(fn, name) {
        try {
          Object.defineProperty(fn, "name", {
            value: name,
            configurable: true
          });
        } catch (_a2) {
        }
      }
      const originalPromise = Promise;
      const originalPromiseThen = Promise.prototype.then;
      const originalPromiseReject = Promise.reject.bind(originalPromise);
      function newPromise(executor) {
        return new originalPromise(executor);
      }
      function promiseResolvedWith(value) {
        return newPromise((resolve) => resolve(value));
      }
      function promiseRejectedWith(reason) {
        return originalPromiseReject(reason);
      }
      function PerformPromiseThen(promise, onFulfilled, onRejected) {
        return originalPromiseThen.call(promise, onFulfilled, onRejected);
      }
      function uponPromise(promise, onFulfilled, onRejected) {
        PerformPromiseThen(PerformPromiseThen(promise, onFulfilled, onRejected), void 0, rethrowAssertionErrorRejection);
      }
      function uponFulfillment(promise, onFulfilled) {
        uponPromise(promise, onFulfilled);
      }
      function uponRejection(promise, onRejected) {
        uponPromise(promise, void 0, onRejected);
      }
      function transformPromiseWith(promise, fulfillmentHandler, rejectionHandler) {
        return PerformPromiseThen(promise, fulfillmentHandler, rejectionHandler);
      }
      function setPromiseIsHandledToTrue(promise) {
        PerformPromiseThen(promise, void 0, rethrowAssertionErrorRejection);
      }
      let _queueMicrotask = (callback) => {
        if (typeof queueMicrotask === "function") {
          _queueMicrotask = queueMicrotask;
        } else {
          const resolvedPromise = promiseResolvedWith(void 0);
          _queueMicrotask = (cb) => PerformPromiseThen(resolvedPromise, cb);
        }
        return _queueMicrotask(callback);
      };
      function reflectCall(F2, V, args) {
        if (typeof F2 !== "function") {
          throw new TypeError("Argument is not a function");
        }
        return Function.prototype.apply.call(F2, V, args);
      }
      function promiseCall(F2, V, args) {
        try {
          return promiseResolvedWith(reflectCall(F2, V, args));
        } catch (value) {
          return promiseRejectedWith(value);
        }
      }
      const QUEUE_MAX_ARRAY_SIZE = 16384;
      class SimpleQueue {
        constructor() {
          this._cursor = 0;
          this._size = 0;
          this._front = {
            _elements: [],
            _next: void 0
          };
          this._back = this._front;
          this._cursor = 0;
          this._size = 0;
        }
        get length() {
          return this._size;
        }
        // For exception safety, this method is structured in order:
        // 1. Read state
        // 2. Calculate required state mutations
        // 3. Perform state mutations
        push(element) {
          const oldBack = this._back;
          let newBack = oldBack;
          if (oldBack._elements.length === QUEUE_MAX_ARRAY_SIZE - 1) {
            newBack = {
              _elements: [],
              _next: void 0
            };
          }
          oldBack._elements.push(element);
          if (newBack !== oldBack) {
            this._back = newBack;
            oldBack._next = newBack;
          }
          ++this._size;
        }
        // Like push(), shift() follows the read -> calculate -> mutate pattern for
        // exception safety.
        shift() {
          const oldFront = this._front;
          let newFront = oldFront;
          const oldCursor = this._cursor;
          let newCursor = oldCursor + 1;
          const elements = oldFront._elements;
          const element = elements[oldCursor];
          if (newCursor === QUEUE_MAX_ARRAY_SIZE) {
            newFront = oldFront._next;
            newCursor = 0;
          }
          --this._size;
          this._cursor = newCursor;
          if (oldFront !== newFront) {
            this._front = newFront;
          }
          elements[oldCursor] = void 0;
          return element;
        }
        // The tricky thing about forEach() is that it can be called
        // re-entrantly. The queue may be mutated inside the callback. It is easy to
        // see that push() within the callback has no negative effects since the end
        // of the queue is checked for on every iteration. If shift() is called
        // repeatedly within the callback then the next iteration may return an
        // element that has been removed. In this case the callback will be called
        // with undefined values until we either "catch up" with elements that still
        // exist or reach the back of the queue.
        forEach(callback) {
          let i2 = this._cursor;
          let node = this._front;
          let elements = node._elements;
          while (i2 !== elements.length || node._next !== void 0) {
            if (i2 === elements.length) {
              node = node._next;
              elements = node._elements;
              i2 = 0;
              if (elements.length === 0) {
                break;
              }
            }
            callback(elements[i2]);
            ++i2;
          }
        }
        // Return the element that would be returned if shift() was called now,
        // without modifying the queue.
        peek() {
          const front = this._front;
          const cursor = this._cursor;
          return front._elements[cursor];
        }
      }
      const AbortSteps = /* @__PURE__ */ Symbol("[[AbortSteps]]");
      const ErrorSteps = /* @__PURE__ */ Symbol("[[ErrorSteps]]");
      const CancelSteps = /* @__PURE__ */ Symbol("[[CancelSteps]]");
      const PullSteps = /* @__PURE__ */ Symbol("[[PullSteps]]");
      const ReleaseSteps = /* @__PURE__ */ Symbol("[[ReleaseSteps]]");
      function ReadableStreamReaderGenericInitialize(reader, stream) {
        reader._ownerReadableStream = stream;
        stream._reader = reader;
        if (stream._state === "readable") {
          defaultReaderClosedPromiseInitialize(reader);
        } else if (stream._state === "closed") {
          defaultReaderClosedPromiseInitializeAsResolved(reader);
        } else {
          defaultReaderClosedPromiseInitializeAsRejected(reader, stream._storedError);
        }
      }
      function ReadableStreamReaderGenericCancel(reader, reason) {
        const stream = reader._ownerReadableStream;
        return ReadableStreamCancel(stream, reason);
      }
      function ReadableStreamReaderGenericRelease(reader) {
        const stream = reader._ownerReadableStream;
        if (stream._state === "readable") {
          defaultReaderClosedPromiseReject(reader, new TypeError(`Reader was released and can no longer be used to monitor the stream's closedness`));
        } else {
          defaultReaderClosedPromiseResetToRejected(reader, new TypeError(`Reader was released and can no longer be used to monitor the stream's closedness`));
        }
        stream._readableStreamController[ReleaseSteps]();
        stream._reader = void 0;
        reader._ownerReadableStream = void 0;
      }
      function readerLockException(name) {
        return new TypeError("Cannot " + name + " a stream using a released reader");
      }
      function defaultReaderClosedPromiseInitialize(reader) {
        reader._closedPromise = newPromise((resolve, reject) => {
          reader._closedPromise_resolve = resolve;
          reader._closedPromise_reject = reject;
        });
      }
      function defaultReaderClosedPromiseInitializeAsRejected(reader, reason) {
        defaultReaderClosedPromiseInitialize(reader);
        defaultReaderClosedPromiseReject(reader, reason);
      }
      function defaultReaderClosedPromiseInitializeAsResolved(reader) {
        defaultReaderClosedPromiseInitialize(reader);
        defaultReaderClosedPromiseResolve(reader);
      }
      function defaultReaderClosedPromiseReject(reader, reason) {
        if (reader._closedPromise_reject === void 0) {
          return;
        }
        setPromiseIsHandledToTrue(reader._closedPromise);
        reader._closedPromise_reject(reason);
        reader._closedPromise_resolve = void 0;
        reader._closedPromise_reject = void 0;
      }
      function defaultReaderClosedPromiseResetToRejected(reader, reason) {
        defaultReaderClosedPromiseInitializeAsRejected(reader, reason);
      }
      function defaultReaderClosedPromiseResolve(reader) {
        if (reader._closedPromise_resolve === void 0) {
          return;
        }
        reader._closedPromise_resolve(void 0);
        reader._closedPromise_resolve = void 0;
        reader._closedPromise_reject = void 0;
      }
      const NumberIsFinite = Number.isFinite || function(x2) {
        return typeof x2 === "number" && isFinite(x2);
      };
      const MathTrunc = Math.trunc || function(v) {
        return v < 0 ? Math.ceil(v) : Math.floor(v);
      };
      function isDictionary(x2) {
        return typeof x2 === "object" || typeof x2 === "function";
      }
      function assertDictionary(obj, context) {
        if (obj !== void 0 && !isDictionary(obj)) {
          throw new TypeError(`${context} is not an object.`);
        }
      }
      function assertFunction(x2, context) {
        if (typeof x2 !== "function") {
          throw new TypeError(`${context} is not a function.`);
        }
      }
      function isObject(x2) {
        return typeof x2 === "object" && x2 !== null || typeof x2 === "function";
      }
      function assertObject(x2, context) {
        if (!isObject(x2)) {
          throw new TypeError(`${context} is not an object.`);
        }
      }
      function assertRequiredArgument(x2, position, context) {
        if (x2 === void 0) {
          throw new TypeError(`Parameter ${position} is required in '${context}'.`);
        }
      }
      function assertRequiredField(x2, field, context) {
        if (x2 === void 0) {
          throw new TypeError(`${field} is required in '${context}'.`);
        }
      }
      function convertUnrestrictedDouble(value) {
        return Number(value);
      }
      function censorNegativeZero(x2) {
        return x2 === 0 ? 0 : x2;
      }
      function integerPart(x2) {
        return censorNegativeZero(MathTrunc(x2));
      }
      function convertUnsignedLongLongWithEnforceRange(value, context) {
        const lowerBound = 0;
        const upperBound = Number.MAX_SAFE_INTEGER;
        let x2 = Number(value);
        x2 = censorNegativeZero(x2);
        if (!NumberIsFinite(x2)) {
          throw new TypeError(`${context} is not a finite number`);
        }
        x2 = integerPart(x2);
        if (x2 < lowerBound || x2 > upperBound) {
          throw new TypeError(`${context} is outside the accepted range of ${lowerBound} to ${upperBound}, inclusive`);
        }
        if (!NumberIsFinite(x2) || x2 === 0) {
          return 0;
        }
        return x2;
      }
      function assertReadableStream(x2, context) {
        if (!IsReadableStream(x2)) {
          throw new TypeError(`${context} is not a ReadableStream.`);
        }
      }
      function AcquireReadableStreamDefaultReader(stream) {
        return new ReadableStreamDefaultReader(stream);
      }
      function ReadableStreamAddReadRequest(stream, readRequest) {
        stream._reader._readRequests.push(readRequest);
      }
      function ReadableStreamFulfillReadRequest(stream, chunk, done) {
        const reader = stream._reader;
        const readRequest = reader._readRequests.shift();
        if (done) {
          readRequest._closeSteps();
        } else {
          readRequest._chunkSteps(chunk);
        }
      }
      function ReadableStreamGetNumReadRequests(stream) {
        return stream._reader._readRequests.length;
      }
      function ReadableStreamHasDefaultReader(stream) {
        const reader = stream._reader;
        if (reader === void 0) {
          return false;
        }
        if (!IsReadableStreamDefaultReader(reader)) {
          return false;
        }
        return true;
      }
      class ReadableStreamDefaultReader {
        constructor(stream) {
          assertRequiredArgument(stream, 1, "ReadableStreamDefaultReader");
          assertReadableStream(stream, "First parameter");
          if (IsReadableStreamLocked(stream)) {
            throw new TypeError("This stream has already been locked for exclusive reading by another reader");
          }
          ReadableStreamReaderGenericInitialize(this, stream);
          this._readRequests = new SimpleQueue();
        }
        /**
         * Returns a promise that will be fulfilled when the stream becomes closed,
         * or rejected if the stream ever errors or the reader's lock is released before the stream finishes closing.
         */
        get closed() {
          if (!IsReadableStreamDefaultReader(this)) {
            return promiseRejectedWith(defaultReaderBrandCheckException("closed"));
          }
          return this._closedPromise;
        }
        /**
         * If the reader is active, behaves the same as {@link ReadableStream.cancel | stream.cancel(reason)}.
         */
        cancel(reason = void 0) {
          if (!IsReadableStreamDefaultReader(this)) {
            return promiseRejectedWith(defaultReaderBrandCheckException("cancel"));
          }
          if (this._ownerReadableStream === void 0) {
            return promiseRejectedWith(readerLockException("cancel"));
          }
          return ReadableStreamReaderGenericCancel(this, reason);
        }
        /**
         * Returns a promise that allows access to the next chunk from the stream's internal queue, if available.
         *
         * If reading a chunk causes the queue to become empty, more data will be pulled from the underlying source.
         */
        read() {
          if (!IsReadableStreamDefaultReader(this)) {
            return promiseRejectedWith(defaultReaderBrandCheckException("read"));
          }
          if (this._ownerReadableStream === void 0) {
            return promiseRejectedWith(readerLockException("read from"));
          }
          let resolvePromise;
          let rejectPromise;
          const promise = newPromise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
          });
          const readRequest = {
            _chunkSteps: (chunk) => resolvePromise({ value: chunk, done: false }),
            _closeSteps: () => resolvePromise({ value: void 0, done: true }),
            _errorSteps: (e2) => rejectPromise(e2)
          };
          ReadableStreamDefaultReaderRead(this, readRequest);
          return promise;
        }
        /**
         * Releases the reader's lock on the corresponding stream. After the lock is released, the reader is no longer active.
         * If the associated stream is errored when the lock is released, the reader will appear errored in the same way
         * from now on; otherwise, the reader will appear closed.
         *
         * A reader's lock cannot be released while it still has a pending read request, i.e., if a promise returned by
         * the reader's {@link ReadableStreamDefaultReader.read | read()} method has not yet been settled. Attempting to
         * do so will throw a `TypeError` and leave the reader locked to the stream.
         */
        releaseLock() {
          if (!IsReadableStreamDefaultReader(this)) {
            throw defaultReaderBrandCheckException("releaseLock");
          }
          if (this._ownerReadableStream === void 0) {
            return;
          }
          ReadableStreamDefaultReaderRelease(this);
        }
      }
      Object.defineProperties(ReadableStreamDefaultReader.prototype, {
        cancel: { enumerable: true },
        read: { enumerable: true },
        releaseLock: { enumerable: true },
        closed: { enumerable: true }
      });
      setFunctionName(ReadableStreamDefaultReader.prototype.cancel, "cancel");
      setFunctionName(ReadableStreamDefaultReader.prototype.read, "read");
      setFunctionName(ReadableStreamDefaultReader.prototype.releaseLock, "releaseLock");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ReadableStreamDefaultReader.prototype, Symbol.toStringTag, {
          value: "ReadableStreamDefaultReader",
          configurable: true
        });
      }
      function IsReadableStreamDefaultReader(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_readRequests")) {
          return false;
        }
        return x2 instanceof ReadableStreamDefaultReader;
      }
      function ReadableStreamDefaultReaderRead(reader, readRequest) {
        const stream = reader._ownerReadableStream;
        stream._disturbed = true;
        if (stream._state === "closed") {
          readRequest._closeSteps();
        } else if (stream._state === "errored") {
          readRequest._errorSteps(stream._storedError);
        } else {
          stream._readableStreamController[PullSteps](readRequest);
        }
      }
      function ReadableStreamDefaultReaderRelease(reader) {
        ReadableStreamReaderGenericRelease(reader);
        const e2 = new TypeError("Reader was released");
        ReadableStreamDefaultReaderErrorReadRequests(reader, e2);
      }
      function ReadableStreamDefaultReaderErrorReadRequests(reader, e2) {
        const readRequests = reader._readRequests;
        reader._readRequests = new SimpleQueue();
        readRequests.forEach((readRequest) => {
          readRequest._errorSteps(e2);
        });
      }
      function defaultReaderBrandCheckException(name) {
        return new TypeError(`ReadableStreamDefaultReader.prototype.${name} can only be used on a ReadableStreamDefaultReader`);
      }
      const AsyncIteratorPrototype = Object.getPrototypeOf(Object.getPrototypeOf(async function* () {
      }).prototype);
      class ReadableStreamAsyncIteratorImpl {
        constructor(reader, preventCancel) {
          this._ongoingPromise = void 0;
          this._isFinished = false;
          this._reader = reader;
          this._preventCancel = preventCancel;
        }
        next() {
          const nextSteps = () => this._nextSteps();
          this._ongoingPromise = this._ongoingPromise ? transformPromiseWith(this._ongoingPromise, nextSteps, nextSteps) : nextSteps();
          return this._ongoingPromise;
        }
        return(value) {
          const returnSteps = () => this._returnSteps(value);
          return this._ongoingPromise ? transformPromiseWith(this._ongoingPromise, returnSteps, returnSteps) : returnSteps();
        }
        _nextSteps() {
          if (this._isFinished) {
            return Promise.resolve({ value: void 0, done: true });
          }
          const reader = this._reader;
          let resolvePromise;
          let rejectPromise;
          const promise = newPromise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
          });
          const readRequest = {
            _chunkSteps: (chunk) => {
              this._ongoingPromise = void 0;
              _queueMicrotask(() => resolvePromise({ value: chunk, done: false }));
            },
            _closeSteps: () => {
              this._ongoingPromise = void 0;
              this._isFinished = true;
              ReadableStreamReaderGenericRelease(reader);
              resolvePromise({ value: void 0, done: true });
            },
            _errorSteps: (reason) => {
              this._ongoingPromise = void 0;
              this._isFinished = true;
              ReadableStreamReaderGenericRelease(reader);
              rejectPromise(reason);
            }
          };
          ReadableStreamDefaultReaderRead(reader, readRequest);
          return promise;
        }
        _returnSteps(value) {
          if (this._isFinished) {
            return Promise.resolve({ value, done: true });
          }
          this._isFinished = true;
          const reader = this._reader;
          if (!this._preventCancel) {
            const result = ReadableStreamReaderGenericCancel(reader, value);
            ReadableStreamReaderGenericRelease(reader);
            return transformPromiseWith(result, () => ({ value, done: true }));
          }
          ReadableStreamReaderGenericRelease(reader);
          return promiseResolvedWith({ value, done: true });
        }
      }
      const ReadableStreamAsyncIteratorPrototype = {
        next() {
          if (!IsReadableStreamAsyncIterator(this)) {
            return promiseRejectedWith(streamAsyncIteratorBrandCheckException("next"));
          }
          return this._asyncIteratorImpl.next();
        },
        return(value) {
          if (!IsReadableStreamAsyncIterator(this)) {
            return promiseRejectedWith(streamAsyncIteratorBrandCheckException("return"));
          }
          return this._asyncIteratorImpl.return(value);
        }
      };
      Object.setPrototypeOf(ReadableStreamAsyncIteratorPrototype, AsyncIteratorPrototype);
      function AcquireReadableStreamAsyncIterator(stream, preventCancel) {
        const reader = AcquireReadableStreamDefaultReader(stream);
        const impl = new ReadableStreamAsyncIteratorImpl(reader, preventCancel);
        const iterator = Object.create(ReadableStreamAsyncIteratorPrototype);
        iterator._asyncIteratorImpl = impl;
        return iterator;
      }
      function IsReadableStreamAsyncIterator(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_asyncIteratorImpl")) {
          return false;
        }
        try {
          return x2._asyncIteratorImpl instanceof ReadableStreamAsyncIteratorImpl;
        } catch (_a2) {
          return false;
        }
      }
      function streamAsyncIteratorBrandCheckException(name) {
        return new TypeError(`ReadableStreamAsyncIterator.${name} can only be used on a ReadableSteamAsyncIterator`);
      }
      const NumberIsNaN = Number.isNaN || function(x2) {
        return x2 !== x2;
      };
      var _a, _b, _c;
      function CreateArrayFromList(elements) {
        return elements.slice();
      }
      function CopyDataBlockBytes(dest, destOffset, src, srcOffset, n) {
        new Uint8Array(dest).set(new Uint8Array(src, srcOffset, n), destOffset);
      }
      let TransferArrayBuffer = (O) => {
        if (typeof O.transfer === "function") {
          TransferArrayBuffer = (buffer) => buffer.transfer();
        } else if (typeof structuredClone === "function") {
          TransferArrayBuffer = (buffer) => structuredClone(buffer, { transfer: [buffer] });
        } else {
          TransferArrayBuffer = (buffer) => buffer;
        }
        return TransferArrayBuffer(O);
      };
      let IsDetachedBuffer = (O) => {
        if (typeof O.detached === "boolean") {
          IsDetachedBuffer = (buffer) => buffer.detached;
        } else {
          IsDetachedBuffer = (buffer) => buffer.byteLength === 0;
        }
        return IsDetachedBuffer(O);
      };
      function ArrayBufferSlice(buffer, begin, end) {
        if (buffer.slice) {
          return buffer.slice(begin, end);
        }
        const length = end - begin;
        const slice = new ArrayBuffer(length);
        CopyDataBlockBytes(slice, 0, buffer, begin, length);
        return slice;
      }
      function GetMethod(receiver, prop) {
        const func = receiver[prop];
        if (func === void 0 || func === null) {
          return void 0;
        }
        if (typeof func !== "function") {
          throw new TypeError(`${String(prop)} is not a function`);
        }
        return func;
      }
      function CreateAsyncFromSyncIterator(syncIteratorRecord) {
        const syncIterable = {
          [Symbol.iterator]: () => syncIteratorRecord.iterator
        };
        const asyncIterator = (async function* () {
          return yield* syncIterable;
        })();
        const nextMethod = asyncIterator.next;
        return { iterator: asyncIterator, nextMethod, done: false };
      }
      const SymbolAsyncIterator = (_c = (_a = Symbol.asyncIterator) !== null && _a !== void 0 ? _a : (_b = Symbol.for) === null || _b === void 0 ? void 0 : _b.call(Symbol, "Symbol.asyncIterator")) !== null && _c !== void 0 ? _c : "@@asyncIterator";
      function GetIterator(obj, hint = "sync", method) {
        if (method === void 0) {
          if (hint === "async") {
            method = GetMethod(obj, SymbolAsyncIterator);
            if (method === void 0) {
              const syncMethod = GetMethod(obj, Symbol.iterator);
              const syncIteratorRecord = GetIterator(obj, "sync", syncMethod);
              return CreateAsyncFromSyncIterator(syncIteratorRecord);
            }
          } else {
            method = GetMethod(obj, Symbol.iterator);
          }
        }
        if (method === void 0) {
          throw new TypeError("The object is not iterable");
        }
        const iterator = reflectCall(method, obj, []);
        if (!typeIsObject(iterator)) {
          throw new TypeError("The iterator method must return an object");
        }
        const nextMethod = iterator.next;
        return { iterator, nextMethod, done: false };
      }
      function IteratorNext(iteratorRecord) {
        const result = reflectCall(iteratorRecord.nextMethod, iteratorRecord.iterator, []);
        if (!typeIsObject(result)) {
          throw new TypeError("The iterator.next() method must return an object");
        }
        return result;
      }
      function IteratorComplete(iterResult) {
        return Boolean(iterResult.done);
      }
      function IteratorValue(iterResult) {
        return iterResult.value;
      }
      function IsNonNegativeNumber(v) {
        if (typeof v !== "number") {
          return false;
        }
        if (NumberIsNaN(v)) {
          return false;
        }
        if (v < 0) {
          return false;
        }
        return true;
      }
      function CloneAsUint8Array(O) {
        const buffer = ArrayBufferSlice(O.buffer, O.byteOffset, O.byteOffset + O.byteLength);
        return new Uint8Array(buffer);
      }
      function DequeueValue(container) {
        const pair = container._queue.shift();
        container._queueTotalSize -= pair.size;
        if (container._queueTotalSize < 0) {
          container._queueTotalSize = 0;
        }
        return pair.value;
      }
      function EnqueueValueWithSize(container, value, size) {
        if (!IsNonNegativeNumber(size) || size === Infinity) {
          throw new RangeError("Size must be a finite, non-NaN, non-negative number.");
        }
        container._queue.push({ value, size });
        container._queueTotalSize += size;
      }
      function PeekQueueValue(container) {
        const pair = container._queue.peek();
        return pair.value;
      }
      function ResetQueue(container) {
        container._queue = new SimpleQueue();
        container._queueTotalSize = 0;
      }
      function isDataViewConstructor(ctor) {
        return ctor === DataView;
      }
      function isDataView(view) {
        return isDataViewConstructor(view.constructor);
      }
      function arrayBufferViewElementSize(ctor) {
        if (isDataViewConstructor(ctor)) {
          return 1;
        }
        return ctor.BYTES_PER_ELEMENT;
      }
      class ReadableStreamBYOBRequest {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        /**
         * Returns the view for writing in to, or `null` if the BYOB request has already been responded to.
         */
        get view() {
          if (!IsReadableStreamBYOBRequest(this)) {
            throw byobRequestBrandCheckException("view");
          }
          return this._view;
        }
        respond(bytesWritten) {
          if (!IsReadableStreamBYOBRequest(this)) {
            throw byobRequestBrandCheckException("respond");
          }
          assertRequiredArgument(bytesWritten, 1, "respond");
          bytesWritten = convertUnsignedLongLongWithEnforceRange(bytesWritten, "First parameter");
          if (this._associatedReadableByteStreamController === void 0) {
            throw new TypeError("This BYOB request has been invalidated");
          }
          if (IsDetachedBuffer(this._view.buffer)) {
            throw new TypeError(`The BYOB request's buffer has been detached and so cannot be used as a response`);
          }
          ReadableByteStreamControllerRespond(this._associatedReadableByteStreamController, bytesWritten);
        }
        respondWithNewView(view) {
          if (!IsReadableStreamBYOBRequest(this)) {
            throw byobRequestBrandCheckException("respondWithNewView");
          }
          assertRequiredArgument(view, 1, "respondWithNewView");
          if (!ArrayBuffer.isView(view)) {
            throw new TypeError("You can only respond with array buffer views");
          }
          if (this._associatedReadableByteStreamController === void 0) {
            throw new TypeError("This BYOB request has been invalidated");
          }
          if (IsDetachedBuffer(view.buffer)) {
            throw new TypeError("The given view's buffer has been detached and so cannot be used as a response");
          }
          ReadableByteStreamControllerRespondWithNewView(this._associatedReadableByteStreamController, view);
        }
      }
      Object.defineProperties(ReadableStreamBYOBRequest.prototype, {
        respond: { enumerable: true },
        respondWithNewView: { enumerable: true },
        view: { enumerable: true }
      });
      setFunctionName(ReadableStreamBYOBRequest.prototype.respond, "respond");
      setFunctionName(ReadableStreamBYOBRequest.prototype.respondWithNewView, "respondWithNewView");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ReadableStreamBYOBRequest.prototype, Symbol.toStringTag, {
          value: "ReadableStreamBYOBRequest",
          configurable: true
        });
      }
      class ReadableByteStreamController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        /**
         * Returns the current BYOB pull request, or `null` if there isn't one.
         */
        get byobRequest() {
          if (!IsReadableByteStreamController(this)) {
            throw byteStreamControllerBrandCheckException("byobRequest");
          }
          return ReadableByteStreamControllerGetBYOBRequest(this);
        }
        /**
         * Returns the desired size to fill the controlled stream's internal queue. It can be negative, if the queue is
         * over-full. An underlying byte source ought to use this information to determine when and how to apply backpressure.
         */
        get desiredSize() {
          if (!IsReadableByteStreamController(this)) {
            throw byteStreamControllerBrandCheckException("desiredSize");
          }
          return ReadableByteStreamControllerGetDesiredSize(this);
        }
        /**
         * Closes the controlled readable stream. Consumers will still be able to read any previously-enqueued chunks from
         * the stream, but once those are read, the stream will become closed.
         */
        close() {
          if (!IsReadableByteStreamController(this)) {
            throw byteStreamControllerBrandCheckException("close");
          }
          if (this._closeRequested) {
            throw new TypeError("The stream has already been closed; do not close it again!");
          }
          const state = this._controlledReadableByteStream._state;
          if (state !== "readable") {
            throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be closed`);
          }
          ReadableByteStreamControllerClose(this);
        }
        enqueue(chunk) {
          if (!IsReadableByteStreamController(this)) {
            throw byteStreamControllerBrandCheckException("enqueue");
          }
          assertRequiredArgument(chunk, 1, "enqueue");
          if (!ArrayBuffer.isView(chunk)) {
            throw new TypeError("chunk must be an array buffer view");
          }
          if (chunk.byteLength === 0) {
            throw new TypeError("chunk must have non-zero byteLength");
          }
          if (chunk.buffer.byteLength === 0) {
            throw new TypeError(`chunk's buffer must have non-zero byteLength`);
          }
          if (this._closeRequested) {
            throw new TypeError("stream is closed or draining");
          }
          const state = this._controlledReadableByteStream._state;
          if (state !== "readable") {
            throw new TypeError(`The stream (in ${state} state) is not in the readable state and cannot be enqueued to`);
          }
          ReadableByteStreamControllerEnqueue(this, chunk);
        }
        /**
         * Errors the controlled readable stream, making all future interactions with it fail with the given error `e`.
         */
        error(e2 = void 0) {
          if (!IsReadableByteStreamController(this)) {
            throw byteStreamControllerBrandCheckException("error");
          }
          ReadableByteStreamControllerError(this, e2);
        }
        /** @internal */
        [CancelSteps](reason) {
          ReadableByteStreamControllerClearPendingPullIntos(this);
          ResetQueue(this);
          const result = this._cancelAlgorithm(reason);
          ReadableByteStreamControllerClearAlgorithms(this);
          return result;
        }
        /** @internal */
        [PullSteps](readRequest) {
          const stream = this._controlledReadableByteStream;
          if (this._queueTotalSize > 0) {
            ReadableByteStreamControllerFillReadRequestFromQueue(this, readRequest);
            return;
          }
          const autoAllocateChunkSize = this._autoAllocateChunkSize;
          if (autoAllocateChunkSize !== void 0) {
            let buffer;
            try {
              buffer = new ArrayBuffer(autoAllocateChunkSize);
            } catch (bufferE) {
              readRequest._errorSteps(bufferE);
              return;
            }
            const pullIntoDescriptor = {
              buffer,
              bufferByteLength: autoAllocateChunkSize,
              byteOffset: 0,
              byteLength: autoAllocateChunkSize,
              bytesFilled: 0,
              minimumFill: 1,
              elementSize: 1,
              viewConstructor: Uint8Array,
              readerType: "default"
            };
            this._pendingPullIntos.push(pullIntoDescriptor);
          }
          ReadableStreamAddReadRequest(stream, readRequest);
          ReadableByteStreamControllerCallPullIfNeeded(this);
        }
        /** @internal */
        [ReleaseSteps]() {
          if (this._pendingPullIntos.length > 0) {
            const firstPullInto = this._pendingPullIntos.peek();
            firstPullInto.readerType = "none";
            this._pendingPullIntos = new SimpleQueue();
            this._pendingPullIntos.push(firstPullInto);
          }
        }
      }
      Object.defineProperties(ReadableByteStreamController.prototype, {
        close: { enumerable: true },
        enqueue: { enumerable: true },
        error: { enumerable: true },
        byobRequest: { enumerable: true },
        desiredSize: { enumerable: true }
      });
      setFunctionName(ReadableByteStreamController.prototype.close, "close");
      setFunctionName(ReadableByteStreamController.prototype.enqueue, "enqueue");
      setFunctionName(ReadableByteStreamController.prototype.error, "error");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ReadableByteStreamController.prototype, Symbol.toStringTag, {
          value: "ReadableByteStreamController",
          configurable: true
        });
      }
      function IsReadableByteStreamController(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_controlledReadableByteStream")) {
          return false;
        }
        return x2 instanceof ReadableByteStreamController;
      }
      function IsReadableStreamBYOBRequest(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_associatedReadableByteStreamController")) {
          return false;
        }
        return x2 instanceof ReadableStreamBYOBRequest;
      }
      function ReadableByteStreamControllerCallPullIfNeeded(controller) {
        const shouldPull = ReadableByteStreamControllerShouldCallPull(controller);
        if (!shouldPull) {
          return;
        }
        if (controller._pulling) {
          controller._pullAgain = true;
          return;
        }
        controller._pulling = true;
        const pullPromise = controller._pullAlgorithm();
        uponPromise(pullPromise, () => {
          controller._pulling = false;
          if (controller._pullAgain) {
            controller._pullAgain = false;
            ReadableByteStreamControllerCallPullIfNeeded(controller);
          }
          return null;
        }, (e2) => {
          ReadableByteStreamControllerError(controller, e2);
          return null;
        });
      }
      function ReadableByteStreamControllerClearPendingPullIntos(controller) {
        ReadableByteStreamControllerInvalidateBYOBRequest(controller);
        controller._pendingPullIntos = new SimpleQueue();
      }
      function ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor) {
        let done = false;
        if (stream._state === "closed") {
          done = true;
        }
        const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);
        if (pullIntoDescriptor.readerType === "default") {
          ReadableStreamFulfillReadRequest(stream, filledView, done);
        } else {
          ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
        }
      }
      function ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor) {
        const bytesFilled = pullIntoDescriptor.bytesFilled;
        const elementSize = pullIntoDescriptor.elementSize;
        return new pullIntoDescriptor.viewConstructor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, bytesFilled / elementSize);
      }
      function ReadableByteStreamControllerEnqueueChunkToQueue(controller, buffer, byteOffset, byteLength) {
        controller._queue.push({ buffer, byteOffset, byteLength });
        controller._queueTotalSize += byteLength;
      }
      function ReadableByteStreamControllerEnqueueClonedChunkToQueue(controller, buffer, byteOffset, byteLength) {
        let clonedChunk;
        try {
          clonedChunk = ArrayBufferSlice(buffer, byteOffset, byteOffset + byteLength);
        } catch (cloneE) {
          ReadableByteStreamControllerError(controller, cloneE);
          throw cloneE;
        }
        ReadableByteStreamControllerEnqueueChunkToQueue(controller, clonedChunk, 0, byteLength);
      }
      function ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, firstDescriptor) {
        if (firstDescriptor.bytesFilled > 0) {
          ReadableByteStreamControllerEnqueueClonedChunkToQueue(controller, firstDescriptor.buffer, firstDescriptor.byteOffset, firstDescriptor.bytesFilled);
        }
        ReadableByteStreamControllerShiftPendingPullInto(controller);
      }
      function ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor) {
        const maxBytesToCopy = Math.min(controller._queueTotalSize, pullIntoDescriptor.byteLength - pullIntoDescriptor.bytesFilled);
        const maxBytesFilled = pullIntoDescriptor.bytesFilled + maxBytesToCopy;
        let totalBytesToCopyRemaining = maxBytesToCopy;
        let ready = false;
        const remainderBytes = maxBytesFilled % pullIntoDescriptor.elementSize;
        const maxAlignedBytes = maxBytesFilled - remainderBytes;
        if (maxAlignedBytes >= pullIntoDescriptor.minimumFill) {
          totalBytesToCopyRemaining = maxAlignedBytes - pullIntoDescriptor.bytesFilled;
          ready = true;
        }
        const queue = controller._queue;
        while (totalBytesToCopyRemaining > 0) {
          const headOfQueue = queue.peek();
          const bytesToCopy = Math.min(totalBytesToCopyRemaining, headOfQueue.byteLength);
          const destStart = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
          CopyDataBlockBytes(pullIntoDescriptor.buffer, destStart, headOfQueue.buffer, headOfQueue.byteOffset, bytesToCopy);
          if (headOfQueue.byteLength === bytesToCopy) {
            queue.shift();
          } else {
            headOfQueue.byteOffset += bytesToCopy;
            headOfQueue.byteLength -= bytesToCopy;
          }
          controller._queueTotalSize -= bytesToCopy;
          ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesToCopy, pullIntoDescriptor);
          totalBytesToCopyRemaining -= bytesToCopy;
        }
        return ready;
      }
      function ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, size, pullIntoDescriptor) {
        pullIntoDescriptor.bytesFilled += size;
      }
      function ReadableByteStreamControllerHandleQueueDrain(controller) {
        if (controller._queueTotalSize === 0 && controller._closeRequested) {
          ReadableByteStreamControllerClearAlgorithms(controller);
          ReadableStreamClose(controller._controlledReadableByteStream);
        } else {
          ReadableByteStreamControllerCallPullIfNeeded(controller);
        }
      }
      function ReadableByteStreamControllerInvalidateBYOBRequest(controller) {
        if (controller._byobRequest === null) {
          return;
        }
        controller._byobRequest._associatedReadableByteStreamController = void 0;
        controller._byobRequest._view = null;
        controller._byobRequest = null;
      }
      function ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller) {
        while (controller._pendingPullIntos.length > 0) {
          if (controller._queueTotalSize === 0) {
            return;
          }
          const pullIntoDescriptor = controller._pendingPullIntos.peek();
          if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor)) {
            ReadableByteStreamControllerShiftPendingPullInto(controller);
            ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);
          }
        }
      }
      function ReadableByteStreamControllerProcessReadRequestsUsingQueue(controller) {
        const reader = controller._controlledReadableByteStream._reader;
        while (reader._readRequests.length > 0) {
          if (controller._queueTotalSize === 0) {
            return;
          }
          const readRequest = reader._readRequests.shift();
          ReadableByteStreamControllerFillReadRequestFromQueue(controller, readRequest);
        }
      }
      function ReadableByteStreamControllerPullInto(controller, view, min, readIntoRequest) {
        const stream = controller._controlledReadableByteStream;
        const ctor = view.constructor;
        const elementSize = arrayBufferViewElementSize(ctor);
        const { byteOffset, byteLength } = view;
        const minimumFill = min * elementSize;
        let buffer;
        try {
          buffer = TransferArrayBuffer(view.buffer);
        } catch (e2) {
          readIntoRequest._errorSteps(e2);
          return;
        }
        const pullIntoDescriptor = {
          buffer,
          bufferByteLength: buffer.byteLength,
          byteOffset,
          byteLength,
          bytesFilled: 0,
          minimumFill,
          elementSize,
          viewConstructor: ctor,
          readerType: "byob"
        };
        if (controller._pendingPullIntos.length > 0) {
          controller._pendingPullIntos.push(pullIntoDescriptor);
          ReadableStreamAddReadIntoRequest(stream, readIntoRequest);
          return;
        }
        if (stream._state === "closed") {
          const emptyView = new ctor(pullIntoDescriptor.buffer, pullIntoDescriptor.byteOffset, 0);
          readIntoRequest._closeSteps(emptyView);
          return;
        }
        if (controller._queueTotalSize > 0) {
          if (ReadableByteStreamControllerFillPullIntoDescriptorFromQueue(controller, pullIntoDescriptor)) {
            const filledView = ReadableByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);
            ReadableByteStreamControllerHandleQueueDrain(controller);
            readIntoRequest._chunkSteps(filledView);
            return;
          }
          if (controller._closeRequested) {
            const e2 = new TypeError("Insufficient bytes to fill elements in the given buffer");
            ReadableByteStreamControllerError(controller, e2);
            readIntoRequest._errorSteps(e2);
            return;
          }
        }
        controller._pendingPullIntos.push(pullIntoDescriptor);
        ReadableStreamAddReadIntoRequest(stream, readIntoRequest);
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }
      function ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor) {
        if (firstDescriptor.readerType === "none") {
          ReadableByteStreamControllerShiftPendingPullInto(controller);
        }
        const stream = controller._controlledReadableByteStream;
        if (ReadableStreamHasBYOBReader(stream)) {
          while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
            const pullIntoDescriptor = ReadableByteStreamControllerShiftPendingPullInto(controller);
            ReadableByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
          }
        }
      }
      function ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, pullIntoDescriptor) {
        ReadableByteStreamControllerFillHeadPullIntoDescriptor(controller, bytesWritten, pullIntoDescriptor);
        if (pullIntoDescriptor.readerType === "none") {
          ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, pullIntoDescriptor);
          ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
          return;
        }
        if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.minimumFill) {
          return;
        }
        ReadableByteStreamControllerShiftPendingPullInto(controller);
        const remainderSize = pullIntoDescriptor.bytesFilled % pullIntoDescriptor.elementSize;
        if (remainderSize > 0) {
          const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
          ReadableByteStreamControllerEnqueueClonedChunkToQueue(controller, pullIntoDescriptor.buffer, end - remainderSize, remainderSize);
        }
        pullIntoDescriptor.bytesFilled -= remainderSize;
        ReadableByteStreamControllerCommitPullIntoDescriptor(controller._controlledReadableByteStream, pullIntoDescriptor);
        ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
      }
      function ReadableByteStreamControllerRespondInternal(controller, bytesWritten) {
        const firstDescriptor = controller._pendingPullIntos.peek();
        ReadableByteStreamControllerInvalidateBYOBRequest(controller);
        const state = controller._controlledReadableByteStream._state;
        if (state === "closed") {
          ReadableByteStreamControllerRespondInClosedState(controller, firstDescriptor);
        } else {
          ReadableByteStreamControllerRespondInReadableState(controller, bytesWritten, firstDescriptor);
        }
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }
      function ReadableByteStreamControllerShiftPendingPullInto(controller) {
        const descriptor = controller._pendingPullIntos.shift();
        return descriptor;
      }
      function ReadableByteStreamControllerShouldCallPull(controller) {
        const stream = controller._controlledReadableByteStream;
        if (stream._state !== "readable") {
          return false;
        }
        if (controller._closeRequested) {
          return false;
        }
        if (!controller._started) {
          return false;
        }
        if (ReadableStreamHasDefaultReader(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
          return true;
        }
        if (ReadableStreamHasBYOBReader(stream) && ReadableStreamGetNumReadIntoRequests(stream) > 0) {
          return true;
        }
        const desiredSize = ReadableByteStreamControllerGetDesiredSize(controller);
        if (desiredSize > 0) {
          return true;
        }
        return false;
      }
      function ReadableByteStreamControllerClearAlgorithms(controller) {
        controller._pullAlgorithm = void 0;
        controller._cancelAlgorithm = void 0;
      }
      function ReadableByteStreamControllerClose(controller) {
        const stream = controller._controlledReadableByteStream;
        if (controller._closeRequested || stream._state !== "readable") {
          return;
        }
        if (controller._queueTotalSize > 0) {
          controller._closeRequested = true;
          return;
        }
        if (controller._pendingPullIntos.length > 0) {
          const firstPendingPullInto = controller._pendingPullIntos.peek();
          if (firstPendingPullInto.bytesFilled % firstPendingPullInto.elementSize !== 0) {
            const e2 = new TypeError("Insufficient bytes to fill elements in the given buffer");
            ReadableByteStreamControllerError(controller, e2);
            throw e2;
          }
        }
        ReadableByteStreamControllerClearAlgorithms(controller);
        ReadableStreamClose(stream);
      }
      function ReadableByteStreamControllerEnqueue(controller, chunk) {
        const stream = controller._controlledReadableByteStream;
        if (controller._closeRequested || stream._state !== "readable") {
          return;
        }
        const { buffer, byteOffset, byteLength } = chunk;
        if (IsDetachedBuffer(buffer)) {
          throw new TypeError("chunk's buffer is detached and so cannot be enqueued");
        }
        const transferredBuffer = TransferArrayBuffer(buffer);
        if (controller._pendingPullIntos.length > 0) {
          const firstPendingPullInto = controller._pendingPullIntos.peek();
          if (IsDetachedBuffer(firstPendingPullInto.buffer)) {
            throw new TypeError("The BYOB request's buffer has been detached and so cannot be filled with an enqueued chunk");
          }
          ReadableByteStreamControllerInvalidateBYOBRequest(controller);
          firstPendingPullInto.buffer = TransferArrayBuffer(firstPendingPullInto.buffer);
          if (firstPendingPullInto.readerType === "none") {
            ReadableByteStreamControllerEnqueueDetachedPullIntoToQueue(controller, firstPendingPullInto);
          }
        }
        if (ReadableStreamHasDefaultReader(stream)) {
          ReadableByteStreamControllerProcessReadRequestsUsingQueue(controller);
          if (ReadableStreamGetNumReadRequests(stream) === 0) {
            ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
          } else {
            if (controller._pendingPullIntos.length > 0) {
              ReadableByteStreamControllerShiftPendingPullInto(controller);
            }
            const transferredView = new Uint8Array(transferredBuffer, byteOffset, byteLength);
            ReadableStreamFulfillReadRequest(stream, transferredView, false);
          }
        } else if (ReadableStreamHasBYOBReader(stream)) {
          ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
          ReadableByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
        } else {
          ReadableByteStreamControllerEnqueueChunkToQueue(controller, transferredBuffer, byteOffset, byteLength);
        }
        ReadableByteStreamControllerCallPullIfNeeded(controller);
      }
      function ReadableByteStreamControllerError(controller, e2) {
        const stream = controller._controlledReadableByteStream;
        if (stream._state !== "readable") {
          return;
        }
        ReadableByteStreamControllerClearPendingPullIntos(controller);
        ResetQueue(controller);
        ReadableByteStreamControllerClearAlgorithms(controller);
        ReadableStreamError(stream, e2);
      }
      function ReadableByteStreamControllerFillReadRequestFromQueue(controller, readRequest) {
        const entry = controller._queue.shift();
        controller._queueTotalSize -= entry.byteLength;
        ReadableByteStreamControllerHandleQueueDrain(controller);
        const view = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
        readRequest._chunkSteps(view);
      }
      function ReadableByteStreamControllerGetBYOBRequest(controller) {
        if (controller._byobRequest === null && controller._pendingPullIntos.length > 0) {
          const firstDescriptor = controller._pendingPullIntos.peek();
          const view = new Uint8Array(firstDescriptor.buffer, firstDescriptor.byteOffset + firstDescriptor.bytesFilled, firstDescriptor.byteLength - firstDescriptor.bytesFilled);
          const byobRequest = Object.create(ReadableStreamBYOBRequest.prototype);
          SetUpReadableStreamBYOBRequest(byobRequest, controller, view);
          controller._byobRequest = byobRequest;
        }
        return controller._byobRequest;
      }
      function ReadableByteStreamControllerGetDesiredSize(controller) {
        const state = controller._controlledReadableByteStream._state;
        if (state === "errored") {
          return null;
        }
        if (state === "closed") {
          return 0;
        }
        return controller._strategyHWM - controller._queueTotalSize;
      }
      function ReadableByteStreamControllerRespond(controller, bytesWritten) {
        const firstDescriptor = controller._pendingPullIntos.peek();
        const state = controller._controlledReadableByteStream._state;
        if (state === "closed") {
          if (bytesWritten !== 0) {
            throw new TypeError("bytesWritten must be 0 when calling respond() on a closed stream");
          }
        } else {
          if (bytesWritten === 0) {
            throw new TypeError("bytesWritten must be greater than 0 when calling respond() on a readable stream");
          }
          if (firstDescriptor.bytesFilled + bytesWritten > firstDescriptor.byteLength) {
            throw new RangeError("bytesWritten out of range");
          }
        }
        firstDescriptor.buffer = TransferArrayBuffer(firstDescriptor.buffer);
        ReadableByteStreamControllerRespondInternal(controller, bytesWritten);
      }
      function ReadableByteStreamControllerRespondWithNewView(controller, view) {
        const firstDescriptor = controller._pendingPullIntos.peek();
        const state = controller._controlledReadableByteStream._state;
        if (state === "closed") {
          if (view.byteLength !== 0) {
            throw new TypeError("The view's length must be 0 when calling respondWithNewView() on a closed stream");
          }
        } else {
          if (view.byteLength === 0) {
            throw new TypeError("The view's length must be greater than 0 when calling respondWithNewView() on a readable stream");
          }
        }
        if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !== view.byteOffset) {
          throw new RangeError("The region specified by view does not match byobRequest");
        }
        if (firstDescriptor.bufferByteLength !== view.buffer.byteLength) {
          throw new RangeError("The buffer of view has different capacity than byobRequest");
        }
        if (firstDescriptor.bytesFilled + view.byteLength > firstDescriptor.byteLength) {
          throw new RangeError("The region specified by view is larger than byobRequest");
        }
        const viewByteLength = view.byteLength;
        firstDescriptor.buffer = TransferArrayBuffer(view.buffer);
        ReadableByteStreamControllerRespondInternal(controller, viewByteLength);
      }
      function SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize) {
        controller._controlledReadableByteStream = stream;
        controller._pullAgain = false;
        controller._pulling = false;
        controller._byobRequest = null;
        controller._queue = controller._queueTotalSize = void 0;
        ResetQueue(controller);
        controller._closeRequested = false;
        controller._started = false;
        controller._strategyHWM = highWaterMark;
        controller._pullAlgorithm = pullAlgorithm;
        controller._cancelAlgorithm = cancelAlgorithm;
        controller._autoAllocateChunkSize = autoAllocateChunkSize;
        controller._pendingPullIntos = new SimpleQueue();
        stream._readableStreamController = controller;
        const startResult = startAlgorithm();
        uponPromise(promiseResolvedWith(startResult), () => {
          controller._started = true;
          ReadableByteStreamControllerCallPullIfNeeded(controller);
          return null;
        }, (r2) => {
          ReadableByteStreamControllerError(controller, r2);
          return null;
        });
      }
      function SetUpReadableByteStreamControllerFromUnderlyingSource(stream, underlyingByteSource, highWaterMark) {
        const controller = Object.create(ReadableByteStreamController.prototype);
        let startAlgorithm;
        let pullAlgorithm;
        let cancelAlgorithm;
        if (underlyingByteSource.start !== void 0) {
          startAlgorithm = () => underlyingByteSource.start(controller);
        } else {
          startAlgorithm = () => void 0;
        }
        if (underlyingByteSource.pull !== void 0) {
          pullAlgorithm = () => underlyingByteSource.pull(controller);
        } else {
          pullAlgorithm = () => promiseResolvedWith(void 0);
        }
        if (underlyingByteSource.cancel !== void 0) {
          cancelAlgorithm = (reason) => underlyingByteSource.cancel(reason);
        } else {
          cancelAlgorithm = () => promiseResolvedWith(void 0);
        }
        const autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
        if (autoAllocateChunkSize === 0) {
          throw new TypeError("autoAllocateChunkSize must be greater than 0");
        }
        SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, autoAllocateChunkSize);
      }
      function SetUpReadableStreamBYOBRequest(request, controller, view) {
        request._associatedReadableByteStreamController = controller;
        request._view = view;
      }
      function byobRequestBrandCheckException(name) {
        return new TypeError(`ReadableStreamBYOBRequest.prototype.${name} can only be used on a ReadableStreamBYOBRequest`);
      }
      function byteStreamControllerBrandCheckException(name) {
        return new TypeError(`ReadableByteStreamController.prototype.${name} can only be used on a ReadableByteStreamController`);
      }
      function convertReaderOptions(options, context) {
        assertDictionary(options, context);
        const mode = options === null || options === void 0 ? void 0 : options.mode;
        return {
          mode: mode === void 0 ? void 0 : convertReadableStreamReaderMode(mode, `${context} has member 'mode' that`)
        };
      }
      function convertReadableStreamReaderMode(mode, context) {
        mode = `${mode}`;
        if (mode !== "byob") {
          throw new TypeError(`${context} '${mode}' is not a valid enumeration value for ReadableStreamReaderMode`);
        }
        return mode;
      }
      function convertByobReadOptions(options, context) {
        var _a2;
        assertDictionary(options, context);
        const min = (_a2 = options === null || options === void 0 ? void 0 : options.min) !== null && _a2 !== void 0 ? _a2 : 1;
        return {
          min: convertUnsignedLongLongWithEnforceRange(min, `${context} has member 'min' that`)
        };
      }
      function AcquireReadableStreamBYOBReader(stream) {
        return new ReadableStreamBYOBReader(stream);
      }
      function ReadableStreamAddReadIntoRequest(stream, readIntoRequest) {
        stream._reader._readIntoRequests.push(readIntoRequest);
      }
      function ReadableStreamFulfillReadIntoRequest(stream, chunk, done) {
        const reader = stream._reader;
        const readIntoRequest = reader._readIntoRequests.shift();
        if (done) {
          readIntoRequest._closeSteps(chunk);
        } else {
          readIntoRequest._chunkSteps(chunk);
        }
      }
      function ReadableStreamGetNumReadIntoRequests(stream) {
        return stream._reader._readIntoRequests.length;
      }
      function ReadableStreamHasBYOBReader(stream) {
        const reader = stream._reader;
        if (reader === void 0) {
          return false;
        }
        if (!IsReadableStreamBYOBReader(reader)) {
          return false;
        }
        return true;
      }
      class ReadableStreamBYOBReader {
        constructor(stream) {
          assertRequiredArgument(stream, 1, "ReadableStreamBYOBReader");
          assertReadableStream(stream, "First parameter");
          if (IsReadableStreamLocked(stream)) {
            throw new TypeError("This stream has already been locked for exclusive reading by another reader");
          }
          if (!IsReadableByteStreamController(stream._readableStreamController)) {
            throw new TypeError("Cannot construct a ReadableStreamBYOBReader for a stream not constructed with a byte source");
          }
          ReadableStreamReaderGenericInitialize(this, stream);
          this._readIntoRequests = new SimpleQueue();
        }
        /**
         * Returns a promise that will be fulfilled when the stream becomes closed, or rejected if the stream ever errors or
         * the reader's lock is released before the stream finishes closing.
         */
        get closed() {
          if (!IsReadableStreamBYOBReader(this)) {
            return promiseRejectedWith(byobReaderBrandCheckException("closed"));
          }
          return this._closedPromise;
        }
        /**
         * If the reader is active, behaves the same as {@link ReadableStream.cancel | stream.cancel(reason)}.
         */
        cancel(reason = void 0) {
          if (!IsReadableStreamBYOBReader(this)) {
            return promiseRejectedWith(byobReaderBrandCheckException("cancel"));
          }
          if (this._ownerReadableStream === void 0) {
            return promiseRejectedWith(readerLockException("cancel"));
          }
          return ReadableStreamReaderGenericCancel(this, reason);
        }
        read(view, rawOptions = {}) {
          if (!IsReadableStreamBYOBReader(this)) {
            return promiseRejectedWith(byobReaderBrandCheckException("read"));
          }
          if (!ArrayBuffer.isView(view)) {
            return promiseRejectedWith(new TypeError("view must be an array buffer view"));
          }
          if (view.byteLength === 0) {
            return promiseRejectedWith(new TypeError("view must have non-zero byteLength"));
          }
          if (view.buffer.byteLength === 0) {
            return promiseRejectedWith(new TypeError(`view's buffer must have non-zero byteLength`));
          }
          if (IsDetachedBuffer(view.buffer)) {
            return promiseRejectedWith(new TypeError("view's buffer has been detached"));
          }
          let options;
          try {
            options = convertByobReadOptions(rawOptions, "options");
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
          const min = options.min;
          if (min === 0) {
            return promiseRejectedWith(new TypeError("options.min must be greater than 0"));
          }
          if (!isDataView(view)) {
            if (min > view.length) {
              return promiseRejectedWith(new RangeError("options.min must be less than or equal to view's length"));
            }
          } else if (min > view.byteLength) {
            return promiseRejectedWith(new RangeError("options.min must be less than or equal to view's byteLength"));
          }
          if (this._ownerReadableStream === void 0) {
            return promiseRejectedWith(readerLockException("read from"));
          }
          let resolvePromise;
          let rejectPromise;
          const promise = newPromise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
          });
          const readIntoRequest = {
            _chunkSteps: (chunk) => resolvePromise({ value: chunk, done: false }),
            _closeSteps: (chunk) => resolvePromise({ value: chunk, done: true }),
            _errorSteps: (e2) => rejectPromise(e2)
          };
          ReadableStreamBYOBReaderRead(this, view, min, readIntoRequest);
          return promise;
        }
        /**
         * Releases the reader's lock on the corresponding stream. After the lock is released, the reader is no longer active.
         * If the associated stream is errored when the lock is released, the reader will appear errored in the same way
         * from now on; otherwise, the reader will appear closed.
         *
         * A reader's lock cannot be released while it still has a pending read request, i.e., if a promise returned by
         * the reader's {@link ReadableStreamBYOBReader.read | read()} method has not yet been settled. Attempting to
         * do so will throw a `TypeError` and leave the reader locked to the stream.
         */
        releaseLock() {
          if (!IsReadableStreamBYOBReader(this)) {
            throw byobReaderBrandCheckException("releaseLock");
          }
          if (this._ownerReadableStream === void 0) {
            return;
          }
          ReadableStreamBYOBReaderRelease(this);
        }
      }
      Object.defineProperties(ReadableStreamBYOBReader.prototype, {
        cancel: { enumerable: true },
        read: { enumerable: true },
        releaseLock: { enumerable: true },
        closed: { enumerable: true }
      });
      setFunctionName(ReadableStreamBYOBReader.prototype.cancel, "cancel");
      setFunctionName(ReadableStreamBYOBReader.prototype.read, "read");
      setFunctionName(ReadableStreamBYOBReader.prototype.releaseLock, "releaseLock");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ReadableStreamBYOBReader.prototype, Symbol.toStringTag, {
          value: "ReadableStreamBYOBReader",
          configurable: true
        });
      }
      function IsReadableStreamBYOBReader(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_readIntoRequests")) {
          return false;
        }
        return x2 instanceof ReadableStreamBYOBReader;
      }
      function ReadableStreamBYOBReaderRead(reader, view, min, readIntoRequest) {
        const stream = reader._ownerReadableStream;
        stream._disturbed = true;
        if (stream._state === "errored") {
          readIntoRequest._errorSteps(stream._storedError);
        } else {
          ReadableByteStreamControllerPullInto(stream._readableStreamController, view, min, readIntoRequest);
        }
      }
      function ReadableStreamBYOBReaderRelease(reader) {
        ReadableStreamReaderGenericRelease(reader);
        const e2 = new TypeError("Reader was released");
        ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e2);
      }
      function ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e2) {
        const readIntoRequests = reader._readIntoRequests;
        reader._readIntoRequests = new SimpleQueue();
        readIntoRequests.forEach((readIntoRequest) => {
          readIntoRequest._errorSteps(e2);
        });
      }
      function byobReaderBrandCheckException(name) {
        return new TypeError(`ReadableStreamBYOBReader.prototype.${name} can only be used on a ReadableStreamBYOBReader`);
      }
      function ExtractHighWaterMark(strategy, defaultHWM) {
        const { highWaterMark } = strategy;
        if (highWaterMark === void 0) {
          return defaultHWM;
        }
        if (NumberIsNaN(highWaterMark) || highWaterMark < 0) {
          throw new RangeError("Invalid highWaterMark");
        }
        return highWaterMark;
      }
      function ExtractSizeAlgorithm(strategy) {
        const { size } = strategy;
        if (!size) {
          return () => 1;
        }
        return size;
      }
      function convertQueuingStrategy(init, context) {
        assertDictionary(init, context);
        const highWaterMark = init === null || init === void 0 ? void 0 : init.highWaterMark;
        const size = init === null || init === void 0 ? void 0 : init.size;
        return {
          highWaterMark: highWaterMark === void 0 ? void 0 : convertUnrestrictedDouble(highWaterMark),
          size: size === void 0 ? void 0 : convertQueuingStrategySize(size, `${context} has member 'size' that`)
        };
      }
      function convertQueuingStrategySize(fn, context) {
        assertFunction(fn, context);
        return (chunk) => convertUnrestrictedDouble(fn(chunk));
      }
      function convertUnderlyingSink(original, context) {
        assertDictionary(original, context);
        const abort = original === null || original === void 0 ? void 0 : original.abort;
        const close = original === null || original === void 0 ? void 0 : original.close;
        const start = original === null || original === void 0 ? void 0 : original.start;
        const type = original === null || original === void 0 ? void 0 : original.type;
        const write = original === null || original === void 0 ? void 0 : original.write;
        return {
          abort: abort === void 0 ? void 0 : convertUnderlyingSinkAbortCallback(abort, original, `${context} has member 'abort' that`),
          close: close === void 0 ? void 0 : convertUnderlyingSinkCloseCallback(close, original, `${context} has member 'close' that`),
          start: start === void 0 ? void 0 : convertUnderlyingSinkStartCallback(start, original, `${context} has member 'start' that`),
          write: write === void 0 ? void 0 : convertUnderlyingSinkWriteCallback(write, original, `${context} has member 'write' that`),
          type
        };
      }
      function convertUnderlyingSinkAbortCallback(fn, original, context) {
        assertFunction(fn, context);
        return (reason) => promiseCall(fn, original, [reason]);
      }
      function convertUnderlyingSinkCloseCallback(fn, original, context) {
        assertFunction(fn, context);
        return () => promiseCall(fn, original, []);
      }
      function convertUnderlyingSinkStartCallback(fn, original, context) {
        assertFunction(fn, context);
        return (controller) => reflectCall(fn, original, [controller]);
      }
      function convertUnderlyingSinkWriteCallback(fn, original, context) {
        assertFunction(fn, context);
        return (chunk, controller) => promiseCall(fn, original, [chunk, controller]);
      }
      function assertWritableStream(x2, context) {
        if (!IsWritableStream(x2)) {
          throw new TypeError(`${context} is not a WritableStream.`);
        }
      }
      function isAbortSignal2(value) {
        if (typeof value !== "object" || value === null) {
          return false;
        }
        try {
          return typeof value.aborted === "boolean";
        } catch (_a2) {
          return false;
        }
      }
      const supportsAbortController = typeof AbortController === "function";
      function createAbortController() {
        if (supportsAbortController) {
          return new AbortController();
        }
        return void 0;
      }
      class WritableStream {
        constructor(rawUnderlyingSink = {}, rawStrategy = {}) {
          if (rawUnderlyingSink === void 0) {
            rawUnderlyingSink = null;
          } else {
            assertObject(rawUnderlyingSink, "First parameter");
          }
          const strategy = convertQueuingStrategy(rawStrategy, "Second parameter");
          const underlyingSink = convertUnderlyingSink(rawUnderlyingSink, "First parameter");
          InitializeWritableStream(this);
          const type = underlyingSink.type;
          if (type !== void 0) {
            throw new RangeError("Invalid type is specified");
          }
          const sizeAlgorithm = ExtractSizeAlgorithm(strategy);
          const highWaterMark = ExtractHighWaterMark(strategy, 1);
          SetUpWritableStreamDefaultControllerFromUnderlyingSink(this, underlyingSink, highWaterMark, sizeAlgorithm);
        }
        /**
         * Returns whether or not the writable stream is locked to a writer.
         */
        get locked() {
          if (!IsWritableStream(this)) {
            throw streamBrandCheckException$2("locked");
          }
          return IsWritableStreamLocked(this);
        }
        /**
         * Aborts the stream, signaling that the producer can no longer successfully write to the stream and it is to be
         * immediately moved to an errored state, with any queued-up writes discarded. This will also execute any abort
         * mechanism of the underlying sink.
         *
         * The returned promise will fulfill if the stream shuts down successfully, or reject if the underlying sink signaled
         * that there was an error doing so. Additionally, it will reject with a `TypeError` (without attempting to cancel
         * the stream) if the stream is currently locked.
         */
        abort(reason = void 0) {
          if (!IsWritableStream(this)) {
            return promiseRejectedWith(streamBrandCheckException$2("abort"));
          }
          if (IsWritableStreamLocked(this)) {
            return promiseRejectedWith(new TypeError("Cannot abort a stream that already has a writer"));
          }
          return WritableStreamAbort(this, reason);
        }
        /**
         * Closes the stream. The underlying sink will finish processing any previously-written chunks, before invoking its
         * close behavior. During this time any further attempts to write will fail (without erroring the stream).
         *
         * The method returns a promise that will fulfill if all remaining chunks are successfully written and the stream
         * successfully closes, or rejects if an error is encountered during this process. Additionally, it will reject with
         * a `TypeError` (without attempting to cancel the stream) if the stream is currently locked.
         */
        close() {
          if (!IsWritableStream(this)) {
            return promiseRejectedWith(streamBrandCheckException$2("close"));
          }
          if (IsWritableStreamLocked(this)) {
            return promiseRejectedWith(new TypeError("Cannot close a stream that already has a writer"));
          }
          if (WritableStreamCloseQueuedOrInFlight(this)) {
            return promiseRejectedWith(new TypeError("Cannot close an already-closing stream"));
          }
          return WritableStreamClose(this);
        }
        /**
         * Creates a {@link WritableStreamDefaultWriter | writer} and locks the stream to the new writer. While the stream
         * is locked, no other writer can be acquired until this one is released.
         *
         * This functionality is especially useful for creating abstractions that desire the ability to write to a stream
         * without interruption or interleaving. By getting a writer for the stream, you can ensure nobody else can write at
         * the same time, which would cause the resulting written data to be unpredictable and probably useless.
         */
        getWriter() {
          if (!IsWritableStream(this)) {
            throw streamBrandCheckException$2("getWriter");
          }
          return AcquireWritableStreamDefaultWriter(this);
        }
      }
      Object.defineProperties(WritableStream.prototype, {
        abort: { enumerable: true },
        close: { enumerable: true },
        getWriter: { enumerable: true },
        locked: { enumerable: true }
      });
      setFunctionName(WritableStream.prototype.abort, "abort");
      setFunctionName(WritableStream.prototype.close, "close");
      setFunctionName(WritableStream.prototype.getWriter, "getWriter");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(WritableStream.prototype, Symbol.toStringTag, {
          value: "WritableStream",
          configurable: true
        });
      }
      function AcquireWritableStreamDefaultWriter(stream) {
        return new WritableStreamDefaultWriter(stream);
      }
      function CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark = 1, sizeAlgorithm = () => 1) {
        const stream = Object.create(WritableStream.prototype);
        InitializeWritableStream(stream);
        const controller = Object.create(WritableStreamDefaultController.prototype);
        SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm);
        return stream;
      }
      function InitializeWritableStream(stream) {
        stream._state = "writable";
        stream._storedError = void 0;
        stream._writer = void 0;
        stream._writableStreamController = void 0;
        stream._writeRequests = new SimpleQueue();
        stream._inFlightWriteRequest = void 0;
        stream._closeRequest = void 0;
        stream._inFlightCloseRequest = void 0;
        stream._pendingAbortRequest = void 0;
        stream._backpressure = false;
      }
      function IsWritableStream(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_writableStreamController")) {
          return false;
        }
        return x2 instanceof WritableStream;
      }
      function IsWritableStreamLocked(stream) {
        if (stream._writer === void 0) {
          return false;
        }
        return true;
      }
      function WritableStreamAbort(stream, reason) {
        var _a2;
        if (stream._state === "closed" || stream._state === "errored") {
          return promiseResolvedWith(void 0);
        }
        stream._writableStreamController._abortReason = reason;
        (_a2 = stream._writableStreamController._abortController) === null || _a2 === void 0 ? void 0 : _a2.abort(reason);
        const state = stream._state;
        if (state === "closed" || state === "errored") {
          return promiseResolvedWith(void 0);
        }
        if (stream._pendingAbortRequest !== void 0) {
          return stream._pendingAbortRequest._promise;
        }
        let wasAlreadyErroring = false;
        if (state === "erroring") {
          wasAlreadyErroring = true;
          reason = void 0;
        }
        const promise = newPromise((resolve, reject) => {
          stream._pendingAbortRequest = {
            _promise: void 0,
            _resolve: resolve,
            _reject: reject,
            _reason: reason,
            _wasAlreadyErroring: wasAlreadyErroring
          };
        });
        stream._pendingAbortRequest._promise = promise;
        if (!wasAlreadyErroring) {
          WritableStreamStartErroring(stream, reason);
        }
        return promise;
      }
      function WritableStreamClose(stream) {
        const state = stream._state;
        if (state === "closed" || state === "errored") {
          return promiseRejectedWith(new TypeError(`The stream (in ${state} state) is not in the writable state and cannot be closed`));
        }
        const promise = newPromise((resolve, reject) => {
          const closeRequest = {
            _resolve: resolve,
            _reject: reject
          };
          stream._closeRequest = closeRequest;
        });
        const writer = stream._writer;
        if (writer !== void 0 && stream._backpressure && state === "writable") {
          defaultWriterReadyPromiseResolve(writer);
        }
        WritableStreamDefaultControllerClose(stream._writableStreamController);
        return promise;
      }
      function WritableStreamAddWriteRequest(stream) {
        const promise = newPromise((resolve, reject) => {
          const writeRequest = {
            _resolve: resolve,
            _reject: reject
          };
          stream._writeRequests.push(writeRequest);
        });
        return promise;
      }
      function WritableStreamDealWithRejection(stream, error) {
        const state = stream._state;
        if (state === "writable") {
          WritableStreamStartErroring(stream, error);
          return;
        }
        WritableStreamFinishErroring(stream);
      }
      function WritableStreamStartErroring(stream, reason) {
        const controller = stream._writableStreamController;
        stream._state = "erroring";
        stream._storedError = reason;
        const writer = stream._writer;
        if (writer !== void 0) {
          WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, reason);
        }
        if (!WritableStreamHasOperationMarkedInFlight(stream) && controller._started) {
          WritableStreamFinishErroring(stream);
        }
      }
      function WritableStreamFinishErroring(stream) {
        stream._state = "errored";
        stream._writableStreamController[ErrorSteps]();
        const storedError = stream._storedError;
        stream._writeRequests.forEach((writeRequest) => {
          writeRequest._reject(storedError);
        });
        stream._writeRequests = new SimpleQueue();
        if (stream._pendingAbortRequest === void 0) {
          WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
          return;
        }
        const abortRequest = stream._pendingAbortRequest;
        stream._pendingAbortRequest = void 0;
        if (abortRequest._wasAlreadyErroring) {
          abortRequest._reject(storedError);
          WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
          return;
        }
        const promise = stream._writableStreamController[AbortSteps](abortRequest._reason);
        uponPromise(promise, () => {
          abortRequest._resolve();
          WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
          return null;
        }, (reason) => {
          abortRequest._reject(reason);
          WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream);
          return null;
        });
      }
      function WritableStreamFinishInFlightWrite(stream) {
        stream._inFlightWriteRequest._resolve(void 0);
        stream._inFlightWriteRequest = void 0;
      }
      function WritableStreamFinishInFlightWriteWithError(stream, error) {
        stream._inFlightWriteRequest._reject(error);
        stream._inFlightWriteRequest = void 0;
        WritableStreamDealWithRejection(stream, error);
      }
      function WritableStreamFinishInFlightClose(stream) {
        stream._inFlightCloseRequest._resolve(void 0);
        stream._inFlightCloseRequest = void 0;
        const state = stream._state;
        if (state === "erroring") {
          stream._storedError = void 0;
          if (stream._pendingAbortRequest !== void 0) {
            stream._pendingAbortRequest._resolve();
            stream._pendingAbortRequest = void 0;
          }
        }
        stream._state = "closed";
        const writer = stream._writer;
        if (writer !== void 0) {
          defaultWriterClosedPromiseResolve(writer);
        }
      }
      function WritableStreamFinishInFlightCloseWithError(stream, error) {
        stream._inFlightCloseRequest._reject(error);
        stream._inFlightCloseRequest = void 0;
        if (stream._pendingAbortRequest !== void 0) {
          stream._pendingAbortRequest._reject(error);
          stream._pendingAbortRequest = void 0;
        }
        WritableStreamDealWithRejection(stream, error);
      }
      function WritableStreamCloseQueuedOrInFlight(stream) {
        if (stream._closeRequest === void 0 && stream._inFlightCloseRequest === void 0) {
          return false;
        }
        return true;
      }
      function WritableStreamHasOperationMarkedInFlight(stream) {
        if (stream._inFlightWriteRequest === void 0 && stream._inFlightCloseRequest === void 0) {
          return false;
        }
        return true;
      }
      function WritableStreamMarkCloseRequestInFlight(stream) {
        stream._inFlightCloseRequest = stream._closeRequest;
        stream._closeRequest = void 0;
      }
      function WritableStreamMarkFirstWriteRequestInFlight(stream) {
        stream._inFlightWriteRequest = stream._writeRequests.shift();
      }
      function WritableStreamRejectCloseAndClosedPromiseIfNeeded(stream) {
        if (stream._closeRequest !== void 0) {
          stream._closeRequest._reject(stream._storedError);
          stream._closeRequest = void 0;
        }
        const writer = stream._writer;
        if (writer !== void 0) {
          defaultWriterClosedPromiseReject(writer, stream._storedError);
        }
      }
      function WritableStreamUpdateBackpressure(stream, backpressure) {
        const writer = stream._writer;
        if (writer !== void 0 && backpressure !== stream._backpressure) {
          if (backpressure) {
            defaultWriterReadyPromiseReset(writer);
          } else {
            defaultWriterReadyPromiseResolve(writer);
          }
        }
        stream._backpressure = backpressure;
      }
      class WritableStreamDefaultWriter {
        constructor(stream) {
          assertRequiredArgument(stream, 1, "WritableStreamDefaultWriter");
          assertWritableStream(stream, "First parameter");
          if (IsWritableStreamLocked(stream)) {
            throw new TypeError("This stream has already been locked for exclusive writing by another writer");
          }
          this._ownerWritableStream = stream;
          stream._writer = this;
          const state = stream._state;
          if (state === "writable") {
            if (!WritableStreamCloseQueuedOrInFlight(stream) && stream._backpressure) {
              defaultWriterReadyPromiseInitialize(this);
            } else {
              defaultWriterReadyPromiseInitializeAsResolved(this);
            }
            defaultWriterClosedPromiseInitialize(this);
          } else if (state === "erroring") {
            defaultWriterReadyPromiseInitializeAsRejected(this, stream._storedError);
            defaultWriterClosedPromiseInitialize(this);
          } else if (state === "closed") {
            defaultWriterReadyPromiseInitializeAsResolved(this);
            defaultWriterClosedPromiseInitializeAsResolved(this);
          } else {
            const storedError = stream._storedError;
            defaultWriterReadyPromiseInitializeAsRejected(this, storedError);
            defaultWriterClosedPromiseInitializeAsRejected(this, storedError);
          }
        }
        /**
         * Returns a promise that will be fulfilled when the stream becomes closed, or rejected if the stream ever errors or
         * the writer’s lock is released before the stream finishes closing.
         */
        get closed() {
          if (!IsWritableStreamDefaultWriter(this)) {
            return promiseRejectedWith(defaultWriterBrandCheckException("closed"));
          }
          return this._closedPromise;
        }
        /**
         * Returns the desired size to fill the stream’s internal queue. It can be negative, if the queue is over-full.
         * A producer can use this information to determine the right amount of data to write.
         *
         * It will be `null` if the stream cannot be successfully written to (due to either being errored, or having an abort
         * queued up). It will return zero if the stream is closed. And the getter will throw an exception if invoked when
         * the writer’s lock is released.
         */
        get desiredSize() {
          if (!IsWritableStreamDefaultWriter(this)) {
            throw defaultWriterBrandCheckException("desiredSize");
          }
          if (this._ownerWritableStream === void 0) {
            throw defaultWriterLockException("desiredSize");
          }
          return WritableStreamDefaultWriterGetDesiredSize(this);
        }
        /**
         * Returns a promise that will be fulfilled when the desired size to fill the stream’s internal queue transitions
         * from non-positive to positive, signaling that it is no longer applying backpressure. Once the desired size dips
         * back to zero or below, the getter will return a new promise that stays pending until the next transition.
         *
         * If the stream becomes errored or aborted, or the writer’s lock is released, the returned promise will become
         * rejected.
         */
        get ready() {
          if (!IsWritableStreamDefaultWriter(this)) {
            return promiseRejectedWith(defaultWriterBrandCheckException("ready"));
          }
          return this._readyPromise;
        }
        /**
         * If the reader is active, behaves the same as {@link WritableStream.abort | stream.abort(reason)}.
         */
        abort(reason = void 0) {
          if (!IsWritableStreamDefaultWriter(this)) {
            return promiseRejectedWith(defaultWriterBrandCheckException("abort"));
          }
          if (this._ownerWritableStream === void 0) {
            return promiseRejectedWith(defaultWriterLockException("abort"));
          }
          return WritableStreamDefaultWriterAbort(this, reason);
        }
        /**
         * If the reader is active, behaves the same as {@link WritableStream.close | stream.close()}.
         */
        close() {
          if (!IsWritableStreamDefaultWriter(this)) {
            return promiseRejectedWith(defaultWriterBrandCheckException("close"));
          }
          const stream = this._ownerWritableStream;
          if (stream === void 0) {
            return promiseRejectedWith(defaultWriterLockException("close"));
          }
          if (WritableStreamCloseQueuedOrInFlight(stream)) {
            return promiseRejectedWith(new TypeError("Cannot close an already-closing stream"));
          }
          return WritableStreamDefaultWriterClose(this);
        }
        /**
         * Releases the writer’s lock on the corresponding stream. After the lock is released, the writer is no longer active.
         * If the associated stream is errored when the lock is released, the writer will appear errored in the same way from
         * now on; otherwise, the writer will appear closed.
         *
         * Note that the lock can still be released even if some ongoing writes have not yet finished (i.e. even if the
         * promises returned from previous calls to {@link WritableStreamDefaultWriter.write | write()} have not yet settled).
         * It’s not necessary to hold the lock on the writer for the duration of the write; the lock instead simply prevents
         * other producers from writing in an interleaved manner.
         */
        releaseLock() {
          if (!IsWritableStreamDefaultWriter(this)) {
            throw defaultWriterBrandCheckException("releaseLock");
          }
          const stream = this._ownerWritableStream;
          if (stream === void 0) {
            return;
          }
          WritableStreamDefaultWriterRelease(this);
        }
        write(chunk = void 0) {
          if (!IsWritableStreamDefaultWriter(this)) {
            return promiseRejectedWith(defaultWriterBrandCheckException("write"));
          }
          if (this._ownerWritableStream === void 0) {
            return promiseRejectedWith(defaultWriterLockException("write to"));
          }
          return WritableStreamDefaultWriterWrite(this, chunk);
        }
      }
      Object.defineProperties(WritableStreamDefaultWriter.prototype, {
        abort: { enumerable: true },
        close: { enumerable: true },
        releaseLock: { enumerable: true },
        write: { enumerable: true },
        closed: { enumerable: true },
        desiredSize: { enumerable: true },
        ready: { enumerable: true }
      });
      setFunctionName(WritableStreamDefaultWriter.prototype.abort, "abort");
      setFunctionName(WritableStreamDefaultWriter.prototype.close, "close");
      setFunctionName(WritableStreamDefaultWriter.prototype.releaseLock, "releaseLock");
      setFunctionName(WritableStreamDefaultWriter.prototype.write, "write");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(WritableStreamDefaultWriter.prototype, Symbol.toStringTag, {
          value: "WritableStreamDefaultWriter",
          configurable: true
        });
      }
      function IsWritableStreamDefaultWriter(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_ownerWritableStream")) {
          return false;
        }
        return x2 instanceof WritableStreamDefaultWriter;
      }
      function WritableStreamDefaultWriterAbort(writer, reason) {
        const stream = writer._ownerWritableStream;
        return WritableStreamAbort(stream, reason);
      }
      function WritableStreamDefaultWriterClose(writer) {
        const stream = writer._ownerWritableStream;
        return WritableStreamClose(stream);
      }
      function WritableStreamDefaultWriterCloseWithErrorPropagation(writer) {
        const stream = writer._ownerWritableStream;
        const state = stream._state;
        if (WritableStreamCloseQueuedOrInFlight(stream) || state === "closed") {
          return promiseResolvedWith(void 0);
        }
        if (state === "errored") {
          return promiseRejectedWith(stream._storedError);
        }
        return WritableStreamDefaultWriterClose(writer);
      }
      function WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, error) {
        if (writer._closedPromiseState === "pending") {
          defaultWriterClosedPromiseReject(writer, error);
        } else {
          defaultWriterClosedPromiseResetToRejected(writer, error);
        }
      }
      function WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, error) {
        if (writer._readyPromiseState === "pending") {
          defaultWriterReadyPromiseReject(writer, error);
        } else {
          defaultWriterReadyPromiseResetToRejected(writer, error);
        }
      }
      function WritableStreamDefaultWriterGetDesiredSize(writer) {
        const stream = writer._ownerWritableStream;
        const state = stream._state;
        if (state === "errored" || state === "erroring") {
          return null;
        }
        if (state === "closed") {
          return 0;
        }
        return WritableStreamDefaultControllerGetDesiredSize(stream._writableStreamController);
      }
      function WritableStreamDefaultWriterRelease(writer) {
        const stream = writer._ownerWritableStream;
        const releasedError = new TypeError(`Writer was released and can no longer be used to monitor the stream's closedness`);
        WritableStreamDefaultWriterEnsureReadyPromiseRejected(writer, releasedError);
        WritableStreamDefaultWriterEnsureClosedPromiseRejected(writer, releasedError);
        stream._writer = void 0;
        writer._ownerWritableStream = void 0;
      }
      function WritableStreamDefaultWriterWrite(writer, chunk) {
        const stream = writer._ownerWritableStream;
        const controller = stream._writableStreamController;
        const chunkSize = WritableStreamDefaultControllerGetChunkSize(controller, chunk);
        if (stream !== writer._ownerWritableStream) {
          return promiseRejectedWith(defaultWriterLockException("write to"));
        }
        const state = stream._state;
        if (state === "errored") {
          return promiseRejectedWith(stream._storedError);
        }
        if (WritableStreamCloseQueuedOrInFlight(stream) || state === "closed") {
          return promiseRejectedWith(new TypeError("The stream is closing or closed and cannot be written to"));
        }
        if (state === "erroring") {
          return promiseRejectedWith(stream._storedError);
        }
        const promise = WritableStreamAddWriteRequest(stream);
        WritableStreamDefaultControllerWrite(controller, chunk, chunkSize);
        return promise;
      }
      const closeSentinel = {};
      class WritableStreamDefaultController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        /**
         * The reason which was passed to `WritableStream.abort(reason)` when the stream was aborted.
         *
         * @deprecated
         *  This property has been removed from the specification, see https://github.com/whatwg/streams/pull/1177.
         *  Use {@link WritableStreamDefaultController.signal}'s `reason` instead.
         */
        get abortReason() {
          if (!IsWritableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$2("abortReason");
          }
          return this._abortReason;
        }
        /**
         * An `AbortSignal` that can be used to abort the pending write or close operation when the stream is aborted.
         */
        get signal() {
          if (!IsWritableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$2("signal");
          }
          if (this._abortController === void 0) {
            throw new TypeError("WritableStreamDefaultController.prototype.signal is not supported");
          }
          return this._abortController.signal;
        }
        /**
         * Closes the controlled writable stream, making all future interactions with it fail with the given error `e`.
         *
         * This method is rarely used, since usually it suffices to return a rejected promise from one of the underlying
         * sink's methods. However, it can be useful for suddenly shutting down a stream in response to an event outside the
         * normal lifecycle of interactions with the underlying sink.
         */
        error(e2 = void 0) {
          if (!IsWritableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$2("error");
          }
          const state = this._controlledWritableStream._state;
          if (state !== "writable") {
            return;
          }
          WritableStreamDefaultControllerError(this, e2);
        }
        /** @internal */
        [AbortSteps](reason) {
          const result = this._abortAlgorithm(reason);
          WritableStreamDefaultControllerClearAlgorithms(this);
          return result;
        }
        /** @internal */
        [ErrorSteps]() {
          ResetQueue(this);
        }
      }
      Object.defineProperties(WritableStreamDefaultController.prototype, {
        abortReason: { enumerable: true },
        signal: { enumerable: true },
        error: { enumerable: true }
      });
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(WritableStreamDefaultController.prototype, Symbol.toStringTag, {
          value: "WritableStreamDefaultController",
          configurable: true
        });
      }
      function IsWritableStreamDefaultController(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_controlledWritableStream")) {
          return false;
        }
        return x2 instanceof WritableStreamDefaultController;
      }
      function SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm) {
        controller._controlledWritableStream = stream;
        stream._writableStreamController = controller;
        controller._queue = void 0;
        controller._queueTotalSize = void 0;
        ResetQueue(controller);
        controller._abortReason = void 0;
        controller._abortController = createAbortController();
        controller._started = false;
        controller._strategySizeAlgorithm = sizeAlgorithm;
        controller._strategyHWM = highWaterMark;
        controller._writeAlgorithm = writeAlgorithm;
        controller._closeAlgorithm = closeAlgorithm;
        controller._abortAlgorithm = abortAlgorithm;
        const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
        WritableStreamUpdateBackpressure(stream, backpressure);
        const startResult = startAlgorithm();
        const startPromise = promiseResolvedWith(startResult);
        uponPromise(startPromise, () => {
          controller._started = true;
          WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
          return null;
        }, (r2) => {
          controller._started = true;
          WritableStreamDealWithRejection(stream, r2);
          return null;
        });
      }
      function SetUpWritableStreamDefaultControllerFromUnderlyingSink(stream, underlyingSink, highWaterMark, sizeAlgorithm) {
        const controller = Object.create(WritableStreamDefaultController.prototype);
        let startAlgorithm;
        let writeAlgorithm;
        let closeAlgorithm;
        let abortAlgorithm;
        if (underlyingSink.start !== void 0) {
          startAlgorithm = () => underlyingSink.start(controller);
        } else {
          startAlgorithm = () => void 0;
        }
        if (underlyingSink.write !== void 0) {
          writeAlgorithm = (chunk) => underlyingSink.write(chunk, controller);
        } else {
          writeAlgorithm = () => promiseResolvedWith(void 0);
        }
        if (underlyingSink.close !== void 0) {
          closeAlgorithm = () => underlyingSink.close();
        } else {
          closeAlgorithm = () => promiseResolvedWith(void 0);
        }
        if (underlyingSink.abort !== void 0) {
          abortAlgorithm = (reason) => underlyingSink.abort(reason);
        } else {
          abortAlgorithm = () => promiseResolvedWith(void 0);
        }
        SetUpWritableStreamDefaultController(stream, controller, startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, highWaterMark, sizeAlgorithm);
      }
      function WritableStreamDefaultControllerClearAlgorithms(controller) {
        controller._writeAlgorithm = void 0;
        controller._closeAlgorithm = void 0;
        controller._abortAlgorithm = void 0;
        controller._strategySizeAlgorithm = void 0;
      }
      function WritableStreamDefaultControllerClose(controller) {
        EnqueueValueWithSize(controller, closeSentinel, 0);
        WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
      }
      function WritableStreamDefaultControllerGetChunkSize(controller, chunk) {
        try {
          return controller._strategySizeAlgorithm(chunk);
        } catch (chunkSizeE) {
          WritableStreamDefaultControllerErrorIfNeeded(controller, chunkSizeE);
          return 1;
        }
      }
      function WritableStreamDefaultControllerGetDesiredSize(controller) {
        return controller._strategyHWM - controller._queueTotalSize;
      }
      function WritableStreamDefaultControllerWrite(controller, chunk, chunkSize) {
        try {
          EnqueueValueWithSize(controller, chunk, chunkSize);
        } catch (enqueueE) {
          WritableStreamDefaultControllerErrorIfNeeded(controller, enqueueE);
          return;
        }
        const stream = controller._controlledWritableStream;
        if (!WritableStreamCloseQueuedOrInFlight(stream) && stream._state === "writable") {
          const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
          WritableStreamUpdateBackpressure(stream, backpressure);
        }
        WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
      }
      function WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller) {
        const stream = controller._controlledWritableStream;
        if (!controller._started) {
          return;
        }
        if (stream._inFlightWriteRequest !== void 0) {
          return;
        }
        const state = stream._state;
        if (state === "erroring") {
          WritableStreamFinishErroring(stream);
          return;
        }
        if (controller._queue.length === 0) {
          return;
        }
        const value = PeekQueueValue(controller);
        if (value === closeSentinel) {
          WritableStreamDefaultControllerProcessClose(controller);
        } else {
          WritableStreamDefaultControllerProcessWrite(controller, value);
        }
      }
      function WritableStreamDefaultControllerErrorIfNeeded(controller, error) {
        if (controller._controlledWritableStream._state === "writable") {
          WritableStreamDefaultControllerError(controller, error);
        }
      }
      function WritableStreamDefaultControllerProcessClose(controller) {
        const stream = controller._controlledWritableStream;
        WritableStreamMarkCloseRequestInFlight(stream);
        DequeueValue(controller);
        const sinkClosePromise = controller._closeAlgorithm();
        WritableStreamDefaultControllerClearAlgorithms(controller);
        uponPromise(sinkClosePromise, () => {
          WritableStreamFinishInFlightClose(stream);
          return null;
        }, (reason) => {
          WritableStreamFinishInFlightCloseWithError(stream, reason);
          return null;
        });
      }
      function WritableStreamDefaultControllerProcessWrite(controller, chunk) {
        const stream = controller._controlledWritableStream;
        WritableStreamMarkFirstWriteRequestInFlight(stream);
        const sinkWritePromise = controller._writeAlgorithm(chunk);
        uponPromise(sinkWritePromise, () => {
          WritableStreamFinishInFlightWrite(stream);
          const state = stream._state;
          DequeueValue(controller);
          if (!WritableStreamCloseQueuedOrInFlight(stream) && state === "writable") {
            const backpressure = WritableStreamDefaultControllerGetBackpressure(controller);
            WritableStreamUpdateBackpressure(stream, backpressure);
          }
          WritableStreamDefaultControllerAdvanceQueueIfNeeded(controller);
          return null;
        }, (reason) => {
          if (stream._state === "writable") {
            WritableStreamDefaultControllerClearAlgorithms(controller);
          }
          WritableStreamFinishInFlightWriteWithError(stream, reason);
          return null;
        });
      }
      function WritableStreamDefaultControllerGetBackpressure(controller) {
        const desiredSize = WritableStreamDefaultControllerGetDesiredSize(controller);
        return desiredSize <= 0;
      }
      function WritableStreamDefaultControllerError(controller, error) {
        const stream = controller._controlledWritableStream;
        WritableStreamDefaultControllerClearAlgorithms(controller);
        WritableStreamStartErroring(stream, error);
      }
      function streamBrandCheckException$2(name) {
        return new TypeError(`WritableStream.prototype.${name} can only be used on a WritableStream`);
      }
      function defaultControllerBrandCheckException$2(name) {
        return new TypeError(`WritableStreamDefaultController.prototype.${name} can only be used on a WritableStreamDefaultController`);
      }
      function defaultWriterBrandCheckException(name) {
        return new TypeError(`WritableStreamDefaultWriter.prototype.${name} can only be used on a WritableStreamDefaultWriter`);
      }
      function defaultWriterLockException(name) {
        return new TypeError("Cannot " + name + " a stream using a released writer");
      }
      function defaultWriterClosedPromiseInitialize(writer) {
        writer._closedPromise = newPromise((resolve, reject) => {
          writer._closedPromise_resolve = resolve;
          writer._closedPromise_reject = reject;
          writer._closedPromiseState = "pending";
        });
      }
      function defaultWriterClosedPromiseInitializeAsRejected(writer, reason) {
        defaultWriterClosedPromiseInitialize(writer);
        defaultWriterClosedPromiseReject(writer, reason);
      }
      function defaultWriterClosedPromiseInitializeAsResolved(writer) {
        defaultWriterClosedPromiseInitialize(writer);
        defaultWriterClosedPromiseResolve(writer);
      }
      function defaultWriterClosedPromiseReject(writer, reason) {
        if (writer._closedPromise_reject === void 0) {
          return;
        }
        setPromiseIsHandledToTrue(writer._closedPromise);
        writer._closedPromise_reject(reason);
        writer._closedPromise_resolve = void 0;
        writer._closedPromise_reject = void 0;
        writer._closedPromiseState = "rejected";
      }
      function defaultWriterClosedPromiseResetToRejected(writer, reason) {
        defaultWriterClosedPromiseInitializeAsRejected(writer, reason);
      }
      function defaultWriterClosedPromiseResolve(writer) {
        if (writer._closedPromise_resolve === void 0) {
          return;
        }
        writer._closedPromise_resolve(void 0);
        writer._closedPromise_resolve = void 0;
        writer._closedPromise_reject = void 0;
        writer._closedPromiseState = "resolved";
      }
      function defaultWriterReadyPromiseInitialize(writer) {
        writer._readyPromise = newPromise((resolve, reject) => {
          writer._readyPromise_resolve = resolve;
          writer._readyPromise_reject = reject;
        });
        writer._readyPromiseState = "pending";
      }
      function defaultWriterReadyPromiseInitializeAsRejected(writer, reason) {
        defaultWriterReadyPromiseInitialize(writer);
        defaultWriterReadyPromiseReject(writer, reason);
      }
      function defaultWriterReadyPromiseInitializeAsResolved(writer) {
        defaultWriterReadyPromiseInitialize(writer);
        defaultWriterReadyPromiseResolve(writer);
      }
      function defaultWriterReadyPromiseReject(writer, reason) {
        if (writer._readyPromise_reject === void 0) {
          return;
        }
        setPromiseIsHandledToTrue(writer._readyPromise);
        writer._readyPromise_reject(reason);
        writer._readyPromise_resolve = void 0;
        writer._readyPromise_reject = void 0;
        writer._readyPromiseState = "rejected";
      }
      function defaultWriterReadyPromiseReset(writer) {
        defaultWriterReadyPromiseInitialize(writer);
      }
      function defaultWriterReadyPromiseResetToRejected(writer, reason) {
        defaultWriterReadyPromiseInitializeAsRejected(writer, reason);
      }
      function defaultWriterReadyPromiseResolve(writer) {
        if (writer._readyPromise_resolve === void 0) {
          return;
        }
        writer._readyPromise_resolve(void 0);
        writer._readyPromise_resolve = void 0;
        writer._readyPromise_reject = void 0;
        writer._readyPromiseState = "fulfilled";
      }
      function getGlobals() {
        if (typeof globalThis !== "undefined") {
          return globalThis;
        } else if (typeof self !== "undefined") {
          return self;
        } else if (typeof global !== "undefined") {
          return global;
        }
        return void 0;
      }
      const globals = getGlobals();
      function isDOMExceptionConstructor(ctor) {
        if (!(typeof ctor === "function" || typeof ctor === "object")) {
          return false;
        }
        if (ctor.name !== "DOMException") {
          return false;
        }
        try {
          new ctor();
          return true;
        } catch (_a2) {
          return false;
        }
      }
      function getFromGlobal() {
        const ctor = globals === null || globals === void 0 ? void 0 : globals.DOMException;
        return isDOMExceptionConstructor(ctor) ? ctor : void 0;
      }
      function createPolyfill() {
        const ctor = function DOMException3(message, name) {
          this.message = message || "";
          this.name = name || "Error";
          if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
          }
        };
        setFunctionName(ctor, "DOMException");
        ctor.prototype = Object.create(Error.prototype);
        Object.defineProperty(ctor.prototype, "constructor", { value: ctor, writable: true, configurable: true });
        return ctor;
      }
      const DOMException2 = getFromGlobal() || createPolyfill();
      function ReadableStreamPipeTo(source, dest, preventClose, preventAbort, preventCancel, signal) {
        const reader = AcquireReadableStreamDefaultReader(source);
        const writer = AcquireWritableStreamDefaultWriter(dest);
        source._disturbed = true;
        let shuttingDown = false;
        let currentWrite = promiseResolvedWith(void 0);
        return newPromise((resolve, reject) => {
          let abortAlgorithm;
          if (signal !== void 0) {
            abortAlgorithm = () => {
              const error = signal.reason !== void 0 ? signal.reason : new DOMException2("Aborted", "AbortError");
              const actions = [];
              if (!preventAbort) {
                actions.push(() => {
                  if (dest._state === "writable") {
                    return WritableStreamAbort(dest, error);
                  }
                  return promiseResolvedWith(void 0);
                });
              }
              if (!preventCancel) {
                actions.push(() => {
                  if (source._state === "readable") {
                    return ReadableStreamCancel(source, error);
                  }
                  return promiseResolvedWith(void 0);
                });
              }
              shutdownWithAction(() => Promise.all(actions.map((action) => action())), true, error);
            };
            if (signal.aborted) {
              abortAlgorithm();
              return;
            }
            signal.addEventListener("abort", abortAlgorithm);
          }
          function pipeLoop() {
            return newPromise((resolveLoop, rejectLoop) => {
              function next(done) {
                if (done) {
                  resolveLoop();
                } else {
                  PerformPromiseThen(pipeStep(), next, rejectLoop);
                }
              }
              next(false);
            });
          }
          function pipeStep() {
            if (shuttingDown) {
              return promiseResolvedWith(true);
            }
            return PerformPromiseThen(writer._readyPromise, () => {
              return newPromise((resolveRead, rejectRead) => {
                ReadableStreamDefaultReaderRead(reader, {
                  _chunkSteps: (chunk) => {
                    currentWrite = PerformPromiseThen(WritableStreamDefaultWriterWrite(writer, chunk), void 0, noop2);
                    resolveRead(false);
                  },
                  _closeSteps: () => resolveRead(true),
                  _errorSteps: rejectRead
                });
              });
            });
          }
          isOrBecomesErrored(source, reader._closedPromise, (storedError) => {
            if (!preventAbort) {
              shutdownWithAction(() => WritableStreamAbort(dest, storedError), true, storedError);
            } else {
              shutdown(true, storedError);
            }
            return null;
          });
          isOrBecomesErrored(dest, writer._closedPromise, (storedError) => {
            if (!preventCancel) {
              shutdownWithAction(() => ReadableStreamCancel(source, storedError), true, storedError);
            } else {
              shutdown(true, storedError);
            }
            return null;
          });
          isOrBecomesClosed(source, reader._closedPromise, () => {
            if (!preventClose) {
              shutdownWithAction(() => WritableStreamDefaultWriterCloseWithErrorPropagation(writer));
            } else {
              shutdown();
            }
            return null;
          });
          if (WritableStreamCloseQueuedOrInFlight(dest) || dest._state === "closed") {
            const destClosed = new TypeError("the destination writable stream closed before all data could be piped to it");
            if (!preventCancel) {
              shutdownWithAction(() => ReadableStreamCancel(source, destClosed), true, destClosed);
            } else {
              shutdown(true, destClosed);
            }
          }
          setPromiseIsHandledToTrue(pipeLoop());
          function waitForWritesToFinish() {
            const oldCurrentWrite = currentWrite;
            return PerformPromiseThen(currentWrite, () => oldCurrentWrite !== currentWrite ? waitForWritesToFinish() : void 0);
          }
          function isOrBecomesErrored(stream, promise, action) {
            if (stream._state === "errored") {
              action(stream._storedError);
            } else {
              uponRejection(promise, action);
            }
          }
          function isOrBecomesClosed(stream, promise, action) {
            if (stream._state === "closed") {
              action();
            } else {
              uponFulfillment(promise, action);
            }
          }
          function shutdownWithAction(action, originalIsError, originalError) {
            if (shuttingDown) {
              return;
            }
            shuttingDown = true;
            if (dest._state === "writable" && !WritableStreamCloseQueuedOrInFlight(dest)) {
              uponFulfillment(waitForWritesToFinish(), doTheRest);
            } else {
              doTheRest();
            }
            function doTheRest() {
              uponPromise(action(), () => finalize(originalIsError, originalError), (newError) => finalize(true, newError));
              return null;
            }
          }
          function shutdown(isError, error) {
            if (shuttingDown) {
              return;
            }
            shuttingDown = true;
            if (dest._state === "writable" && !WritableStreamCloseQueuedOrInFlight(dest)) {
              uponFulfillment(waitForWritesToFinish(), () => finalize(isError, error));
            } else {
              finalize(isError, error);
            }
          }
          function finalize(isError, error) {
            WritableStreamDefaultWriterRelease(writer);
            ReadableStreamReaderGenericRelease(reader);
            if (signal !== void 0) {
              signal.removeEventListener("abort", abortAlgorithm);
            }
            if (isError) {
              reject(error);
            } else {
              resolve(void 0);
            }
            return null;
          }
        });
      }
      class ReadableStreamDefaultController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        /**
         * Returns the desired size to fill the controlled stream's internal queue. It can be negative, if the queue is
         * over-full. An underlying source ought to use this information to determine when and how to apply backpressure.
         */
        get desiredSize() {
          if (!IsReadableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$1("desiredSize");
          }
          return ReadableStreamDefaultControllerGetDesiredSize(this);
        }
        /**
         * Closes the controlled readable stream. Consumers will still be able to read any previously-enqueued chunks from
         * the stream, but once those are read, the stream will become closed.
         */
        close() {
          if (!IsReadableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$1("close");
          }
          if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
            throw new TypeError("The stream is not in a state that permits close");
          }
          ReadableStreamDefaultControllerClose(this);
        }
        enqueue(chunk = void 0) {
          if (!IsReadableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$1("enqueue");
          }
          if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(this)) {
            throw new TypeError("The stream is not in a state that permits enqueue");
          }
          return ReadableStreamDefaultControllerEnqueue(this, chunk);
        }
        /**
         * Errors the controlled readable stream, making all future interactions with it fail with the given error `e`.
         */
        error(e2 = void 0) {
          if (!IsReadableStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException$1("error");
          }
          ReadableStreamDefaultControllerError(this, e2);
        }
        /** @internal */
        [CancelSteps](reason) {
          ResetQueue(this);
          const result = this._cancelAlgorithm(reason);
          ReadableStreamDefaultControllerClearAlgorithms(this);
          return result;
        }
        /** @internal */
        [PullSteps](readRequest) {
          const stream = this._controlledReadableStream;
          if (this._queue.length > 0) {
            const chunk = DequeueValue(this);
            if (this._closeRequested && this._queue.length === 0) {
              ReadableStreamDefaultControllerClearAlgorithms(this);
              ReadableStreamClose(stream);
            } else {
              ReadableStreamDefaultControllerCallPullIfNeeded(this);
            }
            readRequest._chunkSteps(chunk);
          } else {
            ReadableStreamAddReadRequest(stream, readRequest);
            ReadableStreamDefaultControllerCallPullIfNeeded(this);
          }
        }
        /** @internal */
        [ReleaseSteps]() {
        }
      }
      Object.defineProperties(ReadableStreamDefaultController.prototype, {
        close: { enumerable: true },
        enqueue: { enumerable: true },
        error: { enumerable: true },
        desiredSize: { enumerable: true }
      });
      setFunctionName(ReadableStreamDefaultController.prototype.close, "close");
      setFunctionName(ReadableStreamDefaultController.prototype.enqueue, "enqueue");
      setFunctionName(ReadableStreamDefaultController.prototype.error, "error");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ReadableStreamDefaultController.prototype, Symbol.toStringTag, {
          value: "ReadableStreamDefaultController",
          configurable: true
        });
      }
      function IsReadableStreamDefaultController(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_controlledReadableStream")) {
          return false;
        }
        return x2 instanceof ReadableStreamDefaultController;
      }
      function ReadableStreamDefaultControllerCallPullIfNeeded(controller) {
        const shouldPull = ReadableStreamDefaultControllerShouldCallPull(controller);
        if (!shouldPull) {
          return;
        }
        if (controller._pulling) {
          controller._pullAgain = true;
          return;
        }
        controller._pulling = true;
        const pullPromise = controller._pullAlgorithm();
        uponPromise(pullPromise, () => {
          controller._pulling = false;
          if (controller._pullAgain) {
            controller._pullAgain = false;
            ReadableStreamDefaultControllerCallPullIfNeeded(controller);
          }
          return null;
        }, (e2) => {
          ReadableStreamDefaultControllerError(controller, e2);
          return null;
        });
      }
      function ReadableStreamDefaultControllerShouldCallPull(controller) {
        const stream = controller._controlledReadableStream;
        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
          return false;
        }
        if (!controller._started) {
          return false;
        }
        if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
          return true;
        }
        const desiredSize = ReadableStreamDefaultControllerGetDesiredSize(controller);
        if (desiredSize > 0) {
          return true;
        }
        return false;
      }
      function ReadableStreamDefaultControllerClearAlgorithms(controller) {
        controller._pullAlgorithm = void 0;
        controller._cancelAlgorithm = void 0;
        controller._strategySizeAlgorithm = void 0;
      }
      function ReadableStreamDefaultControllerClose(controller) {
        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
          return;
        }
        const stream = controller._controlledReadableStream;
        controller._closeRequested = true;
        if (controller._queue.length === 0) {
          ReadableStreamDefaultControllerClearAlgorithms(controller);
          ReadableStreamClose(stream);
        }
      }
      function ReadableStreamDefaultControllerEnqueue(controller, chunk) {
        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(controller)) {
          return;
        }
        const stream = controller._controlledReadableStream;
        if (IsReadableStreamLocked(stream) && ReadableStreamGetNumReadRequests(stream) > 0) {
          ReadableStreamFulfillReadRequest(stream, chunk, false);
        } else {
          let chunkSize;
          try {
            chunkSize = controller._strategySizeAlgorithm(chunk);
          } catch (chunkSizeE) {
            ReadableStreamDefaultControllerError(controller, chunkSizeE);
            throw chunkSizeE;
          }
          try {
            EnqueueValueWithSize(controller, chunk, chunkSize);
          } catch (enqueueE) {
            ReadableStreamDefaultControllerError(controller, enqueueE);
            throw enqueueE;
          }
        }
        ReadableStreamDefaultControllerCallPullIfNeeded(controller);
      }
      function ReadableStreamDefaultControllerError(controller, e2) {
        const stream = controller._controlledReadableStream;
        if (stream._state !== "readable") {
          return;
        }
        ResetQueue(controller);
        ReadableStreamDefaultControllerClearAlgorithms(controller);
        ReadableStreamError(stream, e2);
      }
      function ReadableStreamDefaultControllerGetDesiredSize(controller) {
        const state = controller._controlledReadableStream._state;
        if (state === "errored") {
          return null;
        }
        if (state === "closed") {
          return 0;
        }
        return controller._strategyHWM - controller._queueTotalSize;
      }
      function ReadableStreamDefaultControllerHasBackpressure(controller) {
        if (ReadableStreamDefaultControllerShouldCallPull(controller)) {
          return false;
        }
        return true;
      }
      function ReadableStreamDefaultControllerCanCloseOrEnqueue(controller) {
        const state = controller._controlledReadableStream._state;
        if (!controller._closeRequested && state === "readable") {
          return true;
        }
        return false;
      }
      function SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm) {
        controller._controlledReadableStream = stream;
        controller._queue = void 0;
        controller._queueTotalSize = void 0;
        ResetQueue(controller);
        controller._started = false;
        controller._closeRequested = false;
        controller._pullAgain = false;
        controller._pulling = false;
        controller._strategySizeAlgorithm = sizeAlgorithm;
        controller._strategyHWM = highWaterMark;
        controller._pullAlgorithm = pullAlgorithm;
        controller._cancelAlgorithm = cancelAlgorithm;
        stream._readableStreamController = controller;
        const startResult = startAlgorithm();
        uponPromise(promiseResolvedWith(startResult), () => {
          controller._started = true;
          ReadableStreamDefaultControllerCallPullIfNeeded(controller);
          return null;
        }, (r2) => {
          ReadableStreamDefaultControllerError(controller, r2);
          return null;
        });
      }
      function SetUpReadableStreamDefaultControllerFromUnderlyingSource(stream, underlyingSource, highWaterMark, sizeAlgorithm) {
        const controller = Object.create(ReadableStreamDefaultController.prototype);
        let startAlgorithm;
        let pullAlgorithm;
        let cancelAlgorithm;
        if (underlyingSource.start !== void 0) {
          startAlgorithm = () => underlyingSource.start(controller);
        } else {
          startAlgorithm = () => void 0;
        }
        if (underlyingSource.pull !== void 0) {
          pullAlgorithm = () => underlyingSource.pull(controller);
        } else {
          pullAlgorithm = () => promiseResolvedWith(void 0);
        }
        if (underlyingSource.cancel !== void 0) {
          cancelAlgorithm = (reason) => underlyingSource.cancel(reason);
        } else {
          cancelAlgorithm = () => promiseResolvedWith(void 0);
        }
        SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm);
      }
      function defaultControllerBrandCheckException$1(name) {
        return new TypeError(`ReadableStreamDefaultController.prototype.${name} can only be used on a ReadableStreamDefaultController`);
      }
      function ReadableStreamTee(stream, cloneForBranch2) {
        if (IsReadableByteStreamController(stream._readableStreamController)) {
          return ReadableByteStreamTee(stream);
        }
        return ReadableStreamDefaultTee(stream);
      }
      function ReadableStreamDefaultTee(stream, cloneForBranch2) {
        const reader = AcquireReadableStreamDefaultReader(stream);
        let reading = false;
        let readAgain = false;
        let canceled1 = false;
        let canceled2 = false;
        let reason1;
        let reason2;
        let branch1;
        let branch2;
        let resolveCancelPromise;
        const cancelPromise = newPromise((resolve) => {
          resolveCancelPromise = resolve;
        });
        function pullAlgorithm() {
          if (reading) {
            readAgain = true;
            return promiseResolvedWith(void 0);
          }
          reading = true;
          const readRequest = {
            _chunkSteps: (chunk) => {
              _queueMicrotask(() => {
                readAgain = false;
                const chunk1 = chunk;
                const chunk2 = chunk;
                if (!canceled1) {
                  ReadableStreamDefaultControllerEnqueue(branch1._readableStreamController, chunk1);
                }
                if (!canceled2) {
                  ReadableStreamDefaultControllerEnqueue(branch2._readableStreamController, chunk2);
                }
                reading = false;
                if (readAgain) {
                  pullAlgorithm();
                }
              });
            },
            _closeSteps: () => {
              reading = false;
              if (!canceled1) {
                ReadableStreamDefaultControllerClose(branch1._readableStreamController);
              }
              if (!canceled2) {
                ReadableStreamDefaultControllerClose(branch2._readableStreamController);
              }
              if (!canceled1 || !canceled2) {
                resolveCancelPromise(void 0);
              }
            },
            _errorSteps: () => {
              reading = false;
            }
          };
          ReadableStreamDefaultReaderRead(reader, readRequest);
          return promiseResolvedWith(void 0);
        }
        function cancel1Algorithm(reason) {
          canceled1 = true;
          reason1 = reason;
          if (canceled2) {
            const compositeReason = CreateArrayFromList([reason1, reason2]);
            const cancelResult = ReadableStreamCancel(stream, compositeReason);
            resolveCancelPromise(cancelResult);
          }
          return cancelPromise;
        }
        function cancel2Algorithm(reason) {
          canceled2 = true;
          reason2 = reason;
          if (canceled1) {
            const compositeReason = CreateArrayFromList([reason1, reason2]);
            const cancelResult = ReadableStreamCancel(stream, compositeReason);
            resolveCancelPromise(cancelResult);
          }
          return cancelPromise;
        }
        function startAlgorithm() {
        }
        branch1 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel1Algorithm);
        branch2 = CreateReadableStream(startAlgorithm, pullAlgorithm, cancel2Algorithm);
        uponRejection(reader._closedPromise, (r2) => {
          ReadableStreamDefaultControllerError(branch1._readableStreamController, r2);
          ReadableStreamDefaultControllerError(branch2._readableStreamController, r2);
          if (!canceled1 || !canceled2) {
            resolveCancelPromise(void 0);
          }
          return null;
        });
        return [branch1, branch2];
      }
      function ReadableByteStreamTee(stream) {
        let reader = AcquireReadableStreamDefaultReader(stream);
        let reading = false;
        let readAgainForBranch1 = false;
        let readAgainForBranch2 = false;
        let canceled1 = false;
        let canceled2 = false;
        let reason1;
        let reason2;
        let branch1;
        let branch2;
        let resolveCancelPromise;
        const cancelPromise = newPromise((resolve) => {
          resolveCancelPromise = resolve;
        });
        function forwardReaderError(thisReader) {
          uponRejection(thisReader._closedPromise, (r2) => {
            if (thisReader !== reader) {
              return null;
            }
            ReadableByteStreamControllerError(branch1._readableStreamController, r2);
            ReadableByteStreamControllerError(branch2._readableStreamController, r2);
            if (!canceled1 || !canceled2) {
              resolveCancelPromise(void 0);
            }
            return null;
          });
        }
        function pullWithDefaultReader() {
          if (IsReadableStreamBYOBReader(reader)) {
            ReadableStreamReaderGenericRelease(reader);
            reader = AcquireReadableStreamDefaultReader(stream);
            forwardReaderError(reader);
          }
          const readRequest = {
            _chunkSteps: (chunk) => {
              _queueMicrotask(() => {
                readAgainForBranch1 = false;
                readAgainForBranch2 = false;
                const chunk1 = chunk;
                let chunk2 = chunk;
                if (!canceled1 && !canceled2) {
                  try {
                    chunk2 = CloneAsUint8Array(chunk);
                  } catch (cloneE) {
                    ReadableByteStreamControllerError(branch1._readableStreamController, cloneE);
                    ReadableByteStreamControllerError(branch2._readableStreamController, cloneE);
                    resolveCancelPromise(ReadableStreamCancel(stream, cloneE));
                    return;
                  }
                }
                if (!canceled1) {
                  ReadableByteStreamControllerEnqueue(branch1._readableStreamController, chunk1);
                }
                if (!canceled2) {
                  ReadableByteStreamControllerEnqueue(branch2._readableStreamController, chunk2);
                }
                reading = false;
                if (readAgainForBranch1) {
                  pull1Algorithm();
                } else if (readAgainForBranch2) {
                  pull2Algorithm();
                }
              });
            },
            _closeSteps: () => {
              reading = false;
              if (!canceled1) {
                ReadableByteStreamControllerClose(branch1._readableStreamController);
              }
              if (!canceled2) {
                ReadableByteStreamControllerClose(branch2._readableStreamController);
              }
              if (branch1._readableStreamController._pendingPullIntos.length > 0) {
                ReadableByteStreamControllerRespond(branch1._readableStreamController, 0);
              }
              if (branch2._readableStreamController._pendingPullIntos.length > 0) {
                ReadableByteStreamControllerRespond(branch2._readableStreamController, 0);
              }
              if (!canceled1 || !canceled2) {
                resolveCancelPromise(void 0);
              }
            },
            _errorSteps: () => {
              reading = false;
            }
          };
          ReadableStreamDefaultReaderRead(reader, readRequest);
        }
        function pullWithBYOBReader(view, forBranch2) {
          if (IsReadableStreamDefaultReader(reader)) {
            ReadableStreamReaderGenericRelease(reader);
            reader = AcquireReadableStreamBYOBReader(stream);
            forwardReaderError(reader);
          }
          const byobBranch = forBranch2 ? branch2 : branch1;
          const otherBranch = forBranch2 ? branch1 : branch2;
          const readIntoRequest = {
            _chunkSteps: (chunk) => {
              _queueMicrotask(() => {
                readAgainForBranch1 = false;
                readAgainForBranch2 = false;
                const byobCanceled = forBranch2 ? canceled2 : canceled1;
                const otherCanceled = forBranch2 ? canceled1 : canceled2;
                if (!otherCanceled) {
                  let clonedChunk;
                  try {
                    clonedChunk = CloneAsUint8Array(chunk);
                  } catch (cloneE) {
                    ReadableByteStreamControllerError(byobBranch._readableStreamController, cloneE);
                    ReadableByteStreamControllerError(otherBranch._readableStreamController, cloneE);
                    resolveCancelPromise(ReadableStreamCancel(stream, cloneE));
                    return;
                  }
                  if (!byobCanceled) {
                    ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
                  }
                  ReadableByteStreamControllerEnqueue(otherBranch._readableStreamController, clonedChunk);
                } else if (!byobCanceled) {
                  ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
                }
                reading = false;
                if (readAgainForBranch1) {
                  pull1Algorithm();
                } else if (readAgainForBranch2) {
                  pull2Algorithm();
                }
              });
            },
            _closeSteps: (chunk) => {
              reading = false;
              const byobCanceled = forBranch2 ? canceled2 : canceled1;
              const otherCanceled = forBranch2 ? canceled1 : canceled2;
              if (!byobCanceled) {
                ReadableByteStreamControllerClose(byobBranch._readableStreamController);
              }
              if (!otherCanceled) {
                ReadableByteStreamControllerClose(otherBranch._readableStreamController);
              }
              if (chunk !== void 0) {
                if (!byobCanceled) {
                  ReadableByteStreamControllerRespondWithNewView(byobBranch._readableStreamController, chunk);
                }
                if (!otherCanceled && otherBranch._readableStreamController._pendingPullIntos.length > 0) {
                  ReadableByteStreamControllerRespond(otherBranch._readableStreamController, 0);
                }
              }
              if (!byobCanceled || !otherCanceled) {
                resolveCancelPromise(void 0);
              }
            },
            _errorSteps: () => {
              reading = false;
            }
          };
          ReadableStreamBYOBReaderRead(reader, view, 1, readIntoRequest);
        }
        function pull1Algorithm() {
          if (reading) {
            readAgainForBranch1 = true;
            return promiseResolvedWith(void 0);
          }
          reading = true;
          const byobRequest = ReadableByteStreamControllerGetBYOBRequest(branch1._readableStreamController);
          if (byobRequest === null) {
            pullWithDefaultReader();
          } else {
            pullWithBYOBReader(byobRequest._view, false);
          }
          return promiseResolvedWith(void 0);
        }
        function pull2Algorithm() {
          if (reading) {
            readAgainForBranch2 = true;
            return promiseResolvedWith(void 0);
          }
          reading = true;
          const byobRequest = ReadableByteStreamControllerGetBYOBRequest(branch2._readableStreamController);
          if (byobRequest === null) {
            pullWithDefaultReader();
          } else {
            pullWithBYOBReader(byobRequest._view, true);
          }
          return promiseResolvedWith(void 0);
        }
        function cancel1Algorithm(reason) {
          canceled1 = true;
          reason1 = reason;
          if (canceled2) {
            const compositeReason = CreateArrayFromList([reason1, reason2]);
            const cancelResult = ReadableStreamCancel(stream, compositeReason);
            resolveCancelPromise(cancelResult);
          }
          return cancelPromise;
        }
        function cancel2Algorithm(reason) {
          canceled2 = true;
          reason2 = reason;
          if (canceled1) {
            const compositeReason = CreateArrayFromList([reason1, reason2]);
            const cancelResult = ReadableStreamCancel(stream, compositeReason);
            resolveCancelPromise(cancelResult);
          }
          return cancelPromise;
        }
        function startAlgorithm() {
          return;
        }
        branch1 = CreateReadableByteStream(startAlgorithm, pull1Algorithm, cancel1Algorithm);
        branch2 = CreateReadableByteStream(startAlgorithm, pull2Algorithm, cancel2Algorithm);
        forwardReaderError(reader);
        return [branch1, branch2];
      }
      function isReadableStreamLike(stream) {
        return typeIsObject(stream) && typeof stream.getReader !== "undefined";
      }
      function ReadableStreamFrom(source) {
        if (isReadableStreamLike(source)) {
          return ReadableStreamFromDefaultReader(source.getReader());
        }
        return ReadableStreamFromIterable(source);
      }
      function ReadableStreamFromIterable(asyncIterable) {
        let stream;
        const iteratorRecord = GetIterator(asyncIterable, "async");
        const startAlgorithm = noop2;
        function pullAlgorithm() {
          let nextResult;
          try {
            nextResult = IteratorNext(iteratorRecord);
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
          const nextPromise = promiseResolvedWith(nextResult);
          return transformPromiseWith(nextPromise, (iterResult) => {
            if (!typeIsObject(iterResult)) {
              throw new TypeError("The promise returned by the iterator.next() method must fulfill with an object");
            }
            const done = IteratorComplete(iterResult);
            if (done) {
              ReadableStreamDefaultControllerClose(stream._readableStreamController);
            } else {
              const value = IteratorValue(iterResult);
              ReadableStreamDefaultControllerEnqueue(stream._readableStreamController, value);
            }
          });
        }
        function cancelAlgorithm(reason) {
          const iterator = iteratorRecord.iterator;
          let returnMethod;
          try {
            returnMethod = GetMethod(iterator, "return");
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
          if (returnMethod === void 0) {
            return promiseResolvedWith(void 0);
          }
          let returnResult;
          try {
            returnResult = reflectCall(returnMethod, iterator, [reason]);
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
          const returnPromise = promiseResolvedWith(returnResult);
          return transformPromiseWith(returnPromise, (iterResult) => {
            if (!typeIsObject(iterResult)) {
              throw new TypeError("The promise returned by the iterator.return() method must fulfill with an object");
            }
            return void 0;
          });
        }
        stream = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, 0);
        return stream;
      }
      function ReadableStreamFromDefaultReader(reader) {
        let stream;
        const startAlgorithm = noop2;
        function pullAlgorithm() {
          let readPromise;
          try {
            readPromise = reader.read();
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
          return transformPromiseWith(readPromise, (readResult) => {
            if (!typeIsObject(readResult)) {
              throw new TypeError("The promise returned by the reader.read() method must fulfill with an object");
            }
            if (readResult.done) {
              ReadableStreamDefaultControllerClose(stream._readableStreamController);
            } else {
              const value = readResult.value;
              ReadableStreamDefaultControllerEnqueue(stream._readableStreamController, value);
            }
          });
        }
        function cancelAlgorithm(reason) {
          try {
            return promiseResolvedWith(reader.cancel(reason));
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
        }
        stream = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, 0);
        return stream;
      }
      function convertUnderlyingDefaultOrByteSource(source, context) {
        assertDictionary(source, context);
        const original = source;
        const autoAllocateChunkSize = original === null || original === void 0 ? void 0 : original.autoAllocateChunkSize;
        const cancel = original === null || original === void 0 ? void 0 : original.cancel;
        const pull = original === null || original === void 0 ? void 0 : original.pull;
        const start = original === null || original === void 0 ? void 0 : original.start;
        const type = original === null || original === void 0 ? void 0 : original.type;
        return {
          autoAllocateChunkSize: autoAllocateChunkSize === void 0 ? void 0 : convertUnsignedLongLongWithEnforceRange(autoAllocateChunkSize, `${context} has member 'autoAllocateChunkSize' that`),
          cancel: cancel === void 0 ? void 0 : convertUnderlyingSourceCancelCallback(cancel, original, `${context} has member 'cancel' that`),
          pull: pull === void 0 ? void 0 : convertUnderlyingSourcePullCallback(pull, original, `${context} has member 'pull' that`),
          start: start === void 0 ? void 0 : convertUnderlyingSourceStartCallback(start, original, `${context} has member 'start' that`),
          type: type === void 0 ? void 0 : convertReadableStreamType(type, `${context} has member 'type' that`)
        };
      }
      function convertUnderlyingSourceCancelCallback(fn, original, context) {
        assertFunction(fn, context);
        return (reason) => promiseCall(fn, original, [reason]);
      }
      function convertUnderlyingSourcePullCallback(fn, original, context) {
        assertFunction(fn, context);
        return (controller) => promiseCall(fn, original, [controller]);
      }
      function convertUnderlyingSourceStartCallback(fn, original, context) {
        assertFunction(fn, context);
        return (controller) => reflectCall(fn, original, [controller]);
      }
      function convertReadableStreamType(type, context) {
        type = `${type}`;
        if (type !== "bytes") {
          throw new TypeError(`${context} '${type}' is not a valid enumeration value for ReadableStreamType`);
        }
        return type;
      }
      function convertIteratorOptions(options, context) {
        assertDictionary(options, context);
        const preventCancel = options === null || options === void 0 ? void 0 : options.preventCancel;
        return { preventCancel: Boolean(preventCancel) };
      }
      function convertPipeOptions(options, context) {
        assertDictionary(options, context);
        const preventAbort = options === null || options === void 0 ? void 0 : options.preventAbort;
        const preventCancel = options === null || options === void 0 ? void 0 : options.preventCancel;
        const preventClose = options === null || options === void 0 ? void 0 : options.preventClose;
        const signal = options === null || options === void 0 ? void 0 : options.signal;
        if (signal !== void 0) {
          assertAbortSignal(signal, `${context} has member 'signal' that`);
        }
        return {
          preventAbort: Boolean(preventAbort),
          preventCancel: Boolean(preventCancel),
          preventClose: Boolean(preventClose),
          signal
        };
      }
      function assertAbortSignal(signal, context) {
        if (!isAbortSignal2(signal)) {
          throw new TypeError(`${context} is not an AbortSignal.`);
        }
      }
      function convertReadableWritablePair(pair, context) {
        assertDictionary(pair, context);
        const readable = pair === null || pair === void 0 ? void 0 : pair.readable;
        assertRequiredField(readable, "readable", "ReadableWritablePair");
        assertReadableStream(readable, `${context} has member 'readable' that`);
        const writable = pair === null || pair === void 0 ? void 0 : pair.writable;
        assertRequiredField(writable, "writable", "ReadableWritablePair");
        assertWritableStream(writable, `${context} has member 'writable' that`);
        return { readable, writable };
      }
      class ReadableStream2 {
        constructor(rawUnderlyingSource = {}, rawStrategy = {}) {
          if (rawUnderlyingSource === void 0) {
            rawUnderlyingSource = null;
          } else {
            assertObject(rawUnderlyingSource, "First parameter");
          }
          const strategy = convertQueuingStrategy(rawStrategy, "Second parameter");
          const underlyingSource = convertUnderlyingDefaultOrByteSource(rawUnderlyingSource, "First parameter");
          InitializeReadableStream(this);
          if (underlyingSource.type === "bytes") {
            if (strategy.size !== void 0) {
              throw new RangeError("The strategy for a byte stream cannot have a size function");
            }
            const highWaterMark = ExtractHighWaterMark(strategy, 0);
            SetUpReadableByteStreamControllerFromUnderlyingSource(this, underlyingSource, highWaterMark);
          } else {
            const sizeAlgorithm = ExtractSizeAlgorithm(strategy);
            const highWaterMark = ExtractHighWaterMark(strategy, 1);
            SetUpReadableStreamDefaultControllerFromUnderlyingSource(this, underlyingSource, highWaterMark, sizeAlgorithm);
          }
        }
        /**
         * Whether or not the readable stream is locked to a {@link ReadableStreamDefaultReader | reader}.
         */
        get locked() {
          if (!IsReadableStream(this)) {
            throw streamBrandCheckException$1("locked");
          }
          return IsReadableStreamLocked(this);
        }
        /**
         * Cancels the stream, signaling a loss of interest in the stream by a consumer.
         *
         * The supplied `reason` argument will be given to the underlying source's {@link UnderlyingSource.cancel | cancel()}
         * method, which might or might not use it.
         */
        cancel(reason = void 0) {
          if (!IsReadableStream(this)) {
            return promiseRejectedWith(streamBrandCheckException$1("cancel"));
          }
          if (IsReadableStreamLocked(this)) {
            return promiseRejectedWith(new TypeError("Cannot cancel a stream that already has a reader"));
          }
          return ReadableStreamCancel(this, reason);
        }
        getReader(rawOptions = void 0) {
          if (!IsReadableStream(this)) {
            throw streamBrandCheckException$1("getReader");
          }
          const options = convertReaderOptions(rawOptions, "First parameter");
          if (options.mode === void 0) {
            return AcquireReadableStreamDefaultReader(this);
          }
          return AcquireReadableStreamBYOBReader(this);
        }
        pipeThrough(rawTransform, rawOptions = {}) {
          if (!IsReadableStream(this)) {
            throw streamBrandCheckException$1("pipeThrough");
          }
          assertRequiredArgument(rawTransform, 1, "pipeThrough");
          const transform = convertReadableWritablePair(rawTransform, "First parameter");
          const options = convertPipeOptions(rawOptions, "Second parameter");
          if (IsReadableStreamLocked(this)) {
            throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked ReadableStream");
          }
          if (IsWritableStreamLocked(transform.writable)) {
            throw new TypeError("ReadableStream.prototype.pipeThrough cannot be used on a locked WritableStream");
          }
          const promise = ReadableStreamPipeTo(this, transform.writable, options.preventClose, options.preventAbort, options.preventCancel, options.signal);
          setPromiseIsHandledToTrue(promise);
          return transform.readable;
        }
        pipeTo(destination, rawOptions = {}) {
          if (!IsReadableStream(this)) {
            return promiseRejectedWith(streamBrandCheckException$1("pipeTo"));
          }
          if (destination === void 0) {
            return promiseRejectedWith(`Parameter 1 is required in 'pipeTo'.`);
          }
          if (!IsWritableStream(destination)) {
            return promiseRejectedWith(new TypeError(`ReadableStream.prototype.pipeTo's first argument must be a WritableStream`));
          }
          let options;
          try {
            options = convertPipeOptions(rawOptions, "Second parameter");
          } catch (e2) {
            return promiseRejectedWith(e2);
          }
          if (IsReadableStreamLocked(this)) {
            return promiseRejectedWith(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked ReadableStream"));
          }
          if (IsWritableStreamLocked(destination)) {
            return promiseRejectedWith(new TypeError("ReadableStream.prototype.pipeTo cannot be used on a locked WritableStream"));
          }
          return ReadableStreamPipeTo(this, destination, options.preventClose, options.preventAbort, options.preventCancel, options.signal);
        }
        /**
         * Tees this readable stream, returning a two-element array containing the two resulting branches as
         * new {@link ReadableStream} instances.
         *
         * Teeing a stream will lock it, preventing any other consumer from acquiring a reader.
         * To cancel the stream, cancel both of the resulting branches; a composite cancellation reason will then be
         * propagated to the stream's underlying source.
         *
         * Note that the chunks seen in each branch will be the same object. If the chunks are not immutable,
         * this could allow interference between the two branches.
         */
        tee() {
          if (!IsReadableStream(this)) {
            throw streamBrandCheckException$1("tee");
          }
          const branches = ReadableStreamTee(this);
          return CreateArrayFromList(branches);
        }
        values(rawOptions = void 0) {
          if (!IsReadableStream(this)) {
            throw streamBrandCheckException$1("values");
          }
          const options = convertIteratorOptions(rawOptions, "First parameter");
          return AcquireReadableStreamAsyncIterator(this, options.preventCancel);
        }
        [SymbolAsyncIterator](options) {
          return this.values(options);
        }
        /**
         * Creates a new ReadableStream wrapping the provided iterable or async iterable.
         *
         * This can be used to adapt various kinds of objects into a readable stream,
         * such as an array, an async generator, or a Node.js readable stream.
         */
        static from(asyncIterable) {
          return ReadableStreamFrom(asyncIterable);
        }
      }
      Object.defineProperties(ReadableStream2, {
        from: { enumerable: true }
      });
      Object.defineProperties(ReadableStream2.prototype, {
        cancel: { enumerable: true },
        getReader: { enumerable: true },
        pipeThrough: { enumerable: true },
        pipeTo: { enumerable: true },
        tee: { enumerable: true },
        values: { enumerable: true },
        locked: { enumerable: true }
      });
      setFunctionName(ReadableStream2.from, "from");
      setFunctionName(ReadableStream2.prototype.cancel, "cancel");
      setFunctionName(ReadableStream2.prototype.getReader, "getReader");
      setFunctionName(ReadableStream2.prototype.pipeThrough, "pipeThrough");
      setFunctionName(ReadableStream2.prototype.pipeTo, "pipeTo");
      setFunctionName(ReadableStream2.prototype.tee, "tee");
      setFunctionName(ReadableStream2.prototype.values, "values");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ReadableStream2.prototype, Symbol.toStringTag, {
          value: "ReadableStream",
          configurable: true
        });
      }
      Object.defineProperty(ReadableStream2.prototype, SymbolAsyncIterator, {
        value: ReadableStream2.prototype.values,
        writable: true,
        configurable: true
      });
      function CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark = 1, sizeAlgorithm = () => 1) {
        const stream = Object.create(ReadableStream2.prototype);
        InitializeReadableStream(stream);
        const controller = Object.create(ReadableStreamDefaultController.prototype);
        SetUpReadableStreamDefaultController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, highWaterMark, sizeAlgorithm);
        return stream;
      }
      function CreateReadableByteStream(startAlgorithm, pullAlgorithm, cancelAlgorithm) {
        const stream = Object.create(ReadableStream2.prototype);
        InitializeReadableStream(stream);
        const controller = Object.create(ReadableByteStreamController.prototype);
        SetUpReadableByteStreamController(stream, controller, startAlgorithm, pullAlgorithm, cancelAlgorithm, 0, void 0);
        return stream;
      }
      function InitializeReadableStream(stream) {
        stream._state = "readable";
        stream._reader = void 0;
        stream._storedError = void 0;
        stream._disturbed = false;
      }
      function IsReadableStream(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_readableStreamController")) {
          return false;
        }
        return x2 instanceof ReadableStream2;
      }
      function IsReadableStreamLocked(stream) {
        if (stream._reader === void 0) {
          return false;
        }
        return true;
      }
      function ReadableStreamCancel(stream, reason) {
        stream._disturbed = true;
        if (stream._state === "closed") {
          return promiseResolvedWith(void 0);
        }
        if (stream._state === "errored") {
          return promiseRejectedWith(stream._storedError);
        }
        ReadableStreamClose(stream);
        const reader = stream._reader;
        if (reader !== void 0 && IsReadableStreamBYOBReader(reader)) {
          const readIntoRequests = reader._readIntoRequests;
          reader._readIntoRequests = new SimpleQueue();
          readIntoRequests.forEach((readIntoRequest) => {
            readIntoRequest._closeSteps(void 0);
          });
        }
        const sourceCancelPromise = stream._readableStreamController[CancelSteps](reason);
        return transformPromiseWith(sourceCancelPromise, noop2);
      }
      function ReadableStreamClose(stream) {
        stream._state = "closed";
        const reader = stream._reader;
        if (reader === void 0) {
          return;
        }
        defaultReaderClosedPromiseResolve(reader);
        if (IsReadableStreamDefaultReader(reader)) {
          const readRequests = reader._readRequests;
          reader._readRequests = new SimpleQueue();
          readRequests.forEach((readRequest) => {
            readRequest._closeSteps();
          });
        }
      }
      function ReadableStreamError(stream, e2) {
        stream._state = "errored";
        stream._storedError = e2;
        const reader = stream._reader;
        if (reader === void 0) {
          return;
        }
        defaultReaderClosedPromiseReject(reader, e2);
        if (IsReadableStreamDefaultReader(reader)) {
          ReadableStreamDefaultReaderErrorReadRequests(reader, e2);
        } else {
          ReadableStreamBYOBReaderErrorReadIntoRequests(reader, e2);
        }
      }
      function streamBrandCheckException$1(name) {
        return new TypeError(`ReadableStream.prototype.${name} can only be used on a ReadableStream`);
      }
      function convertQueuingStrategyInit(init, context) {
        assertDictionary(init, context);
        const highWaterMark = init === null || init === void 0 ? void 0 : init.highWaterMark;
        assertRequiredField(highWaterMark, "highWaterMark", "QueuingStrategyInit");
        return {
          highWaterMark: convertUnrestrictedDouble(highWaterMark)
        };
      }
      const byteLengthSizeFunction = (chunk) => {
        return chunk.byteLength;
      };
      setFunctionName(byteLengthSizeFunction, "size");
      class ByteLengthQueuingStrategy {
        constructor(options) {
          assertRequiredArgument(options, 1, "ByteLengthQueuingStrategy");
          options = convertQueuingStrategyInit(options, "First parameter");
          this._byteLengthQueuingStrategyHighWaterMark = options.highWaterMark;
        }
        /**
         * Returns the high water mark provided to the constructor.
         */
        get highWaterMark() {
          if (!IsByteLengthQueuingStrategy(this)) {
            throw byteLengthBrandCheckException("highWaterMark");
          }
          return this._byteLengthQueuingStrategyHighWaterMark;
        }
        /**
         * Measures the size of `chunk` by returning the value of its `byteLength` property.
         */
        get size() {
          if (!IsByteLengthQueuingStrategy(this)) {
            throw byteLengthBrandCheckException("size");
          }
          return byteLengthSizeFunction;
        }
      }
      Object.defineProperties(ByteLengthQueuingStrategy.prototype, {
        highWaterMark: { enumerable: true },
        size: { enumerable: true }
      });
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(ByteLengthQueuingStrategy.prototype, Symbol.toStringTag, {
          value: "ByteLengthQueuingStrategy",
          configurable: true
        });
      }
      function byteLengthBrandCheckException(name) {
        return new TypeError(`ByteLengthQueuingStrategy.prototype.${name} can only be used on a ByteLengthQueuingStrategy`);
      }
      function IsByteLengthQueuingStrategy(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_byteLengthQueuingStrategyHighWaterMark")) {
          return false;
        }
        return x2 instanceof ByteLengthQueuingStrategy;
      }
      const countSizeFunction = () => {
        return 1;
      };
      setFunctionName(countSizeFunction, "size");
      class CountQueuingStrategy {
        constructor(options) {
          assertRequiredArgument(options, 1, "CountQueuingStrategy");
          options = convertQueuingStrategyInit(options, "First parameter");
          this._countQueuingStrategyHighWaterMark = options.highWaterMark;
        }
        /**
         * Returns the high water mark provided to the constructor.
         */
        get highWaterMark() {
          if (!IsCountQueuingStrategy(this)) {
            throw countBrandCheckException("highWaterMark");
          }
          return this._countQueuingStrategyHighWaterMark;
        }
        /**
         * Measures the size of `chunk` by always returning 1.
         * This ensures that the total queue size is a count of the number of chunks in the queue.
         */
        get size() {
          if (!IsCountQueuingStrategy(this)) {
            throw countBrandCheckException("size");
          }
          return countSizeFunction;
        }
      }
      Object.defineProperties(CountQueuingStrategy.prototype, {
        highWaterMark: { enumerable: true },
        size: { enumerable: true }
      });
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(CountQueuingStrategy.prototype, Symbol.toStringTag, {
          value: "CountQueuingStrategy",
          configurable: true
        });
      }
      function countBrandCheckException(name) {
        return new TypeError(`CountQueuingStrategy.prototype.${name} can only be used on a CountQueuingStrategy`);
      }
      function IsCountQueuingStrategy(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_countQueuingStrategyHighWaterMark")) {
          return false;
        }
        return x2 instanceof CountQueuingStrategy;
      }
      function convertTransformer(original, context) {
        assertDictionary(original, context);
        const cancel = original === null || original === void 0 ? void 0 : original.cancel;
        const flush = original === null || original === void 0 ? void 0 : original.flush;
        const readableType = original === null || original === void 0 ? void 0 : original.readableType;
        const start = original === null || original === void 0 ? void 0 : original.start;
        const transform = original === null || original === void 0 ? void 0 : original.transform;
        const writableType = original === null || original === void 0 ? void 0 : original.writableType;
        return {
          cancel: cancel === void 0 ? void 0 : convertTransformerCancelCallback(cancel, original, `${context} has member 'cancel' that`),
          flush: flush === void 0 ? void 0 : convertTransformerFlushCallback(flush, original, `${context} has member 'flush' that`),
          readableType,
          start: start === void 0 ? void 0 : convertTransformerStartCallback(start, original, `${context} has member 'start' that`),
          transform: transform === void 0 ? void 0 : convertTransformerTransformCallback(transform, original, `${context} has member 'transform' that`),
          writableType
        };
      }
      function convertTransformerFlushCallback(fn, original, context) {
        assertFunction(fn, context);
        return (controller) => promiseCall(fn, original, [controller]);
      }
      function convertTransformerStartCallback(fn, original, context) {
        assertFunction(fn, context);
        return (controller) => reflectCall(fn, original, [controller]);
      }
      function convertTransformerTransformCallback(fn, original, context) {
        assertFunction(fn, context);
        return (chunk, controller) => promiseCall(fn, original, [chunk, controller]);
      }
      function convertTransformerCancelCallback(fn, original, context) {
        assertFunction(fn, context);
        return (reason) => promiseCall(fn, original, [reason]);
      }
      class TransformStream {
        constructor(rawTransformer = {}, rawWritableStrategy = {}, rawReadableStrategy = {}) {
          if (rawTransformer === void 0) {
            rawTransformer = null;
          }
          const writableStrategy = convertQueuingStrategy(rawWritableStrategy, "Second parameter");
          const readableStrategy = convertQueuingStrategy(rawReadableStrategy, "Third parameter");
          const transformer = convertTransformer(rawTransformer, "First parameter");
          if (transformer.readableType !== void 0) {
            throw new RangeError("Invalid readableType specified");
          }
          if (transformer.writableType !== void 0) {
            throw new RangeError("Invalid writableType specified");
          }
          const readableHighWaterMark = ExtractHighWaterMark(readableStrategy, 0);
          const readableSizeAlgorithm = ExtractSizeAlgorithm(readableStrategy);
          const writableHighWaterMark = ExtractHighWaterMark(writableStrategy, 1);
          const writableSizeAlgorithm = ExtractSizeAlgorithm(writableStrategy);
          let startPromise_resolve;
          const startPromise = newPromise((resolve) => {
            startPromise_resolve = resolve;
          });
          InitializeTransformStream(this, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm);
          SetUpTransformStreamDefaultControllerFromTransformer(this, transformer);
          if (transformer.start !== void 0) {
            startPromise_resolve(transformer.start(this._transformStreamController));
          } else {
            startPromise_resolve(void 0);
          }
        }
        /**
         * The readable side of the transform stream.
         */
        get readable() {
          if (!IsTransformStream(this)) {
            throw streamBrandCheckException("readable");
          }
          return this._readable;
        }
        /**
         * The writable side of the transform stream.
         */
        get writable() {
          if (!IsTransformStream(this)) {
            throw streamBrandCheckException("writable");
          }
          return this._writable;
        }
      }
      Object.defineProperties(TransformStream.prototype, {
        readable: { enumerable: true },
        writable: { enumerable: true }
      });
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(TransformStream.prototype, Symbol.toStringTag, {
          value: "TransformStream",
          configurable: true
        });
      }
      function InitializeTransformStream(stream, startPromise, writableHighWaterMark, writableSizeAlgorithm, readableHighWaterMark, readableSizeAlgorithm) {
        function startAlgorithm() {
          return startPromise;
        }
        function writeAlgorithm(chunk) {
          return TransformStreamDefaultSinkWriteAlgorithm(stream, chunk);
        }
        function abortAlgorithm(reason) {
          return TransformStreamDefaultSinkAbortAlgorithm(stream, reason);
        }
        function closeAlgorithm() {
          return TransformStreamDefaultSinkCloseAlgorithm(stream);
        }
        stream._writable = CreateWritableStream(startAlgorithm, writeAlgorithm, closeAlgorithm, abortAlgorithm, writableHighWaterMark, writableSizeAlgorithm);
        function pullAlgorithm() {
          return TransformStreamDefaultSourcePullAlgorithm(stream);
        }
        function cancelAlgorithm(reason) {
          return TransformStreamDefaultSourceCancelAlgorithm(stream, reason);
        }
        stream._readable = CreateReadableStream(startAlgorithm, pullAlgorithm, cancelAlgorithm, readableHighWaterMark, readableSizeAlgorithm);
        stream._backpressure = void 0;
        stream._backpressureChangePromise = void 0;
        stream._backpressureChangePromise_resolve = void 0;
        TransformStreamSetBackpressure(stream, true);
        stream._transformStreamController = void 0;
      }
      function IsTransformStream(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_transformStreamController")) {
          return false;
        }
        return x2 instanceof TransformStream;
      }
      function TransformStreamError(stream, e2) {
        ReadableStreamDefaultControllerError(stream._readable._readableStreamController, e2);
        TransformStreamErrorWritableAndUnblockWrite(stream, e2);
      }
      function TransformStreamErrorWritableAndUnblockWrite(stream, e2) {
        TransformStreamDefaultControllerClearAlgorithms(stream._transformStreamController);
        WritableStreamDefaultControllerErrorIfNeeded(stream._writable._writableStreamController, e2);
        TransformStreamUnblockWrite(stream);
      }
      function TransformStreamUnblockWrite(stream) {
        if (stream._backpressure) {
          TransformStreamSetBackpressure(stream, false);
        }
      }
      function TransformStreamSetBackpressure(stream, backpressure) {
        if (stream._backpressureChangePromise !== void 0) {
          stream._backpressureChangePromise_resolve();
        }
        stream._backpressureChangePromise = newPromise((resolve) => {
          stream._backpressureChangePromise_resolve = resolve;
        });
        stream._backpressure = backpressure;
      }
      class TransformStreamDefaultController {
        constructor() {
          throw new TypeError("Illegal constructor");
        }
        /**
         * Returns the desired size to fill the readable side’s internal queue. It can be negative, if the queue is over-full.
         */
        get desiredSize() {
          if (!IsTransformStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException("desiredSize");
          }
          const readableController = this._controlledTransformStream._readable._readableStreamController;
          return ReadableStreamDefaultControllerGetDesiredSize(readableController);
        }
        enqueue(chunk = void 0) {
          if (!IsTransformStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException("enqueue");
          }
          TransformStreamDefaultControllerEnqueue(this, chunk);
        }
        /**
         * Errors both the readable side and the writable side of the controlled transform stream, making all future
         * interactions with it fail with the given error `e`. Any chunks queued for transformation will be discarded.
         */
        error(reason = void 0) {
          if (!IsTransformStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException("error");
          }
          TransformStreamDefaultControllerError(this, reason);
        }
        /**
         * Closes the readable side and errors the writable side of the controlled transform stream. This is useful when the
         * transformer only needs to consume a portion of the chunks written to the writable side.
         */
        terminate() {
          if (!IsTransformStreamDefaultController(this)) {
            throw defaultControllerBrandCheckException("terminate");
          }
          TransformStreamDefaultControllerTerminate(this);
        }
      }
      Object.defineProperties(TransformStreamDefaultController.prototype, {
        enqueue: { enumerable: true },
        error: { enumerable: true },
        terminate: { enumerable: true },
        desiredSize: { enumerable: true }
      });
      setFunctionName(TransformStreamDefaultController.prototype.enqueue, "enqueue");
      setFunctionName(TransformStreamDefaultController.prototype.error, "error");
      setFunctionName(TransformStreamDefaultController.prototype.terminate, "terminate");
      if (typeof Symbol.toStringTag === "symbol") {
        Object.defineProperty(TransformStreamDefaultController.prototype, Symbol.toStringTag, {
          value: "TransformStreamDefaultController",
          configurable: true
        });
      }
      function IsTransformStreamDefaultController(x2) {
        if (!typeIsObject(x2)) {
          return false;
        }
        if (!Object.prototype.hasOwnProperty.call(x2, "_controlledTransformStream")) {
          return false;
        }
        return x2 instanceof TransformStreamDefaultController;
      }
      function SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm) {
        controller._controlledTransformStream = stream;
        stream._transformStreamController = controller;
        controller._transformAlgorithm = transformAlgorithm;
        controller._flushAlgorithm = flushAlgorithm;
        controller._cancelAlgorithm = cancelAlgorithm;
        controller._finishPromise = void 0;
        controller._finishPromise_resolve = void 0;
        controller._finishPromise_reject = void 0;
      }
      function SetUpTransformStreamDefaultControllerFromTransformer(stream, transformer) {
        const controller = Object.create(TransformStreamDefaultController.prototype);
        let transformAlgorithm;
        let flushAlgorithm;
        let cancelAlgorithm;
        if (transformer.transform !== void 0) {
          transformAlgorithm = (chunk) => transformer.transform(chunk, controller);
        } else {
          transformAlgorithm = (chunk) => {
            try {
              TransformStreamDefaultControllerEnqueue(controller, chunk);
              return promiseResolvedWith(void 0);
            } catch (transformResultE) {
              return promiseRejectedWith(transformResultE);
            }
          };
        }
        if (transformer.flush !== void 0) {
          flushAlgorithm = () => transformer.flush(controller);
        } else {
          flushAlgorithm = () => promiseResolvedWith(void 0);
        }
        if (transformer.cancel !== void 0) {
          cancelAlgorithm = (reason) => transformer.cancel(reason);
        } else {
          cancelAlgorithm = () => promiseResolvedWith(void 0);
        }
        SetUpTransformStreamDefaultController(stream, controller, transformAlgorithm, flushAlgorithm, cancelAlgorithm);
      }
      function TransformStreamDefaultControllerClearAlgorithms(controller) {
        controller._transformAlgorithm = void 0;
        controller._flushAlgorithm = void 0;
        controller._cancelAlgorithm = void 0;
      }
      function TransformStreamDefaultControllerEnqueue(controller, chunk) {
        const stream = controller._controlledTransformStream;
        const readableController = stream._readable._readableStreamController;
        if (!ReadableStreamDefaultControllerCanCloseOrEnqueue(readableController)) {
          throw new TypeError("Readable side is not in a state that permits enqueue");
        }
        try {
          ReadableStreamDefaultControllerEnqueue(readableController, chunk);
        } catch (e2) {
          TransformStreamErrorWritableAndUnblockWrite(stream, e2);
          throw stream._readable._storedError;
        }
        const backpressure = ReadableStreamDefaultControllerHasBackpressure(readableController);
        if (backpressure !== stream._backpressure) {
          TransformStreamSetBackpressure(stream, true);
        }
      }
      function TransformStreamDefaultControllerError(controller, e2) {
        TransformStreamError(controller._controlledTransformStream, e2);
      }
      function TransformStreamDefaultControllerPerformTransform(controller, chunk) {
        const transformPromise = controller._transformAlgorithm(chunk);
        return transformPromiseWith(transformPromise, void 0, (r2) => {
          TransformStreamError(controller._controlledTransformStream, r2);
          throw r2;
        });
      }
      function TransformStreamDefaultControllerTerminate(controller) {
        const stream = controller._controlledTransformStream;
        const readableController = stream._readable._readableStreamController;
        ReadableStreamDefaultControllerClose(readableController);
        const error = new TypeError("TransformStream terminated");
        TransformStreamErrorWritableAndUnblockWrite(stream, error);
      }
      function TransformStreamDefaultSinkWriteAlgorithm(stream, chunk) {
        const controller = stream._transformStreamController;
        if (stream._backpressure) {
          const backpressureChangePromise = stream._backpressureChangePromise;
          return transformPromiseWith(backpressureChangePromise, () => {
            const writable = stream._writable;
            const state = writable._state;
            if (state === "erroring") {
              throw writable._storedError;
            }
            return TransformStreamDefaultControllerPerformTransform(controller, chunk);
          });
        }
        return TransformStreamDefaultControllerPerformTransform(controller, chunk);
      }
      function TransformStreamDefaultSinkAbortAlgorithm(stream, reason) {
        const controller = stream._transformStreamController;
        if (controller._finishPromise !== void 0) {
          return controller._finishPromise;
        }
        const readable = stream._readable;
        controller._finishPromise = newPromise((resolve, reject) => {
          controller._finishPromise_resolve = resolve;
          controller._finishPromise_reject = reject;
        });
        const cancelPromise = controller._cancelAlgorithm(reason);
        TransformStreamDefaultControllerClearAlgorithms(controller);
        uponPromise(cancelPromise, () => {
          if (readable._state === "errored") {
            defaultControllerFinishPromiseReject(controller, readable._storedError);
          } else {
            ReadableStreamDefaultControllerError(readable._readableStreamController, reason);
            defaultControllerFinishPromiseResolve(controller);
          }
          return null;
        }, (r2) => {
          ReadableStreamDefaultControllerError(readable._readableStreamController, r2);
          defaultControllerFinishPromiseReject(controller, r2);
          return null;
        });
        return controller._finishPromise;
      }
      function TransformStreamDefaultSinkCloseAlgorithm(stream) {
        const controller = stream._transformStreamController;
        if (controller._finishPromise !== void 0) {
          return controller._finishPromise;
        }
        const readable = stream._readable;
        controller._finishPromise = newPromise((resolve, reject) => {
          controller._finishPromise_resolve = resolve;
          controller._finishPromise_reject = reject;
        });
        const flushPromise = controller._flushAlgorithm();
        TransformStreamDefaultControllerClearAlgorithms(controller);
        uponPromise(flushPromise, () => {
          if (readable._state === "errored") {
            defaultControllerFinishPromiseReject(controller, readable._storedError);
          } else {
            ReadableStreamDefaultControllerClose(readable._readableStreamController);
            defaultControllerFinishPromiseResolve(controller);
          }
          return null;
        }, (r2) => {
          ReadableStreamDefaultControllerError(readable._readableStreamController, r2);
          defaultControllerFinishPromiseReject(controller, r2);
          return null;
        });
        return controller._finishPromise;
      }
      function TransformStreamDefaultSourcePullAlgorithm(stream) {
        TransformStreamSetBackpressure(stream, false);
        return stream._backpressureChangePromise;
      }
      function TransformStreamDefaultSourceCancelAlgorithm(stream, reason) {
        const controller = stream._transformStreamController;
        if (controller._finishPromise !== void 0) {
          return controller._finishPromise;
        }
        const writable = stream._writable;
        controller._finishPromise = newPromise((resolve, reject) => {
          controller._finishPromise_resolve = resolve;
          controller._finishPromise_reject = reject;
        });
        const cancelPromise = controller._cancelAlgorithm(reason);
        TransformStreamDefaultControllerClearAlgorithms(controller);
        uponPromise(cancelPromise, () => {
          if (writable._state === "errored") {
            defaultControllerFinishPromiseReject(controller, writable._storedError);
          } else {
            WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, reason);
            TransformStreamUnblockWrite(stream);
            defaultControllerFinishPromiseResolve(controller);
          }
          return null;
        }, (r2) => {
          WritableStreamDefaultControllerErrorIfNeeded(writable._writableStreamController, r2);
          TransformStreamUnblockWrite(stream);
          defaultControllerFinishPromiseReject(controller, r2);
          return null;
        });
        return controller._finishPromise;
      }
      function defaultControllerBrandCheckException(name) {
        return new TypeError(`TransformStreamDefaultController.prototype.${name} can only be used on a TransformStreamDefaultController`);
      }
      function defaultControllerFinishPromiseResolve(controller) {
        if (controller._finishPromise_resolve === void 0) {
          return;
        }
        controller._finishPromise_resolve();
        controller._finishPromise_resolve = void 0;
        controller._finishPromise_reject = void 0;
      }
      function defaultControllerFinishPromiseReject(controller, reason) {
        if (controller._finishPromise_reject === void 0) {
          return;
        }
        setPromiseIsHandledToTrue(controller._finishPromise);
        controller._finishPromise_reject(reason);
        controller._finishPromise_resolve = void 0;
        controller._finishPromise_reject = void 0;
      }
      function streamBrandCheckException(name) {
        return new TypeError(`TransformStream.prototype.${name} can only be used on a TransformStream`);
      }
      exports3.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
      exports3.CountQueuingStrategy = CountQueuingStrategy;
      exports3.ReadableByteStreamController = ReadableByteStreamController;
      exports3.ReadableStream = ReadableStream2;
      exports3.ReadableStreamBYOBReader = ReadableStreamBYOBReader;
      exports3.ReadableStreamBYOBRequest = ReadableStreamBYOBRequest;
      exports3.ReadableStreamDefaultController = ReadableStreamDefaultController;
      exports3.ReadableStreamDefaultReader = ReadableStreamDefaultReader;
      exports3.TransformStream = TransformStream;
      exports3.TransformStreamDefaultController = TransformStreamDefaultController;
      exports3.WritableStream = WritableStream;
      exports3.WritableStreamDefaultController = WritableStreamDefaultController;
      exports3.WritableStreamDefaultWriter = WritableStreamDefaultWriter;
    }));
  }
});

// node_modules/fetch-blob/streams.cjs
var require_streams = __commonJS({
  "node_modules/fetch-blob/streams.cjs"() {
    var POOL_SIZE2 = 65536;
    if (!globalThis.ReadableStream) {
      try {
        const process2 = require("node:process");
        const { emitWarning } = process2;
        try {
          process2.emitWarning = () => {
          };
          Object.assign(globalThis, require("node:stream/web"));
          process2.emitWarning = emitWarning;
        } catch (error) {
          process2.emitWarning = emitWarning;
          throw error;
        }
      } catch (error) {
        Object.assign(globalThis, require_ponyfill_es2018());
      }
    }
    try {
      const { Blob: Blob3 } = require("buffer");
      if (Blob3 && !Blob3.prototype.stream) {
        Blob3.prototype.stream = function name(params) {
          let position = 0;
          const blob = this;
          return new ReadableStream({
            type: "bytes",
            async pull(ctrl) {
              const chunk = blob.slice(position, Math.min(blob.size, position + POOL_SIZE2));
              const buffer = await chunk.arrayBuffer();
              position += buffer.byteLength;
              ctrl.enqueue(new Uint8Array(buffer));
              if (position === blob.size) {
                ctrl.close();
              }
            }
          });
        };
      }
    } catch (error) {
    }
  }
});

// node_modules/fetch-blob/index.js
async function* toIterator(parts, clone2 = true) {
  for (const part of parts) {
    if ("stream" in part) {
      yield* (
        /** @type {AsyncIterableIterator<Uint8Array>} */
        part.stream()
      );
    } else if (ArrayBuffer.isView(part)) {
      if (clone2) {
        let position = part.byteOffset;
        const end = part.byteOffset + part.byteLength;
        while (position !== end) {
          const size = Math.min(end - position, POOL_SIZE);
          const chunk = part.buffer.slice(position, position + size);
          position += chunk.byteLength;
          yield new Uint8Array(chunk);
        }
      } else {
        yield part;
      }
    } else {
      let position = 0, b = (
        /** @type {Blob} */
        part
      );
      while (position !== b.size) {
        const chunk = b.slice(position, Math.min(b.size, position + POOL_SIZE));
        const buffer = await chunk.arrayBuffer();
        position += buffer.byteLength;
        yield new Uint8Array(buffer);
      }
    }
  }
}
var import_streams, POOL_SIZE, _Blob, Blob2, fetch_blob_default;
var init_fetch_blob = __esm({
  "node_modules/fetch-blob/index.js"() {
    import_streams = __toESM(require_streams(), 1);
    POOL_SIZE = 65536;
    _Blob = class Blob {
      /** @type {Array.<(Blob|Uint8Array)>} */
      #parts = [];
      #type = "";
      #size = 0;
      #endings = "transparent";
      /**
       * The Blob() constructor returns a new Blob object. The content
       * of the blob consists of the concatenation of the values given
       * in the parameter array.
       *
       * @param {*} blobParts
       * @param {{ type?: string, endings?: string }} [options]
       */
      constructor(blobParts = [], options = {}) {
        if (typeof blobParts !== "object" || blobParts === null) {
          throw new TypeError("Failed to construct 'Blob': The provided value cannot be converted to a sequence.");
        }
        if (typeof blobParts[Symbol.iterator] !== "function") {
          throw new TypeError("Failed to construct 'Blob': The object must have a callable @@iterator property.");
        }
        if (typeof options !== "object" && typeof options !== "function") {
          throw new TypeError("Failed to construct 'Blob': parameter 2 cannot convert to dictionary.");
        }
        if (options === null) options = {};
        const encoder = new TextEncoder();
        for (const element of blobParts) {
          let part;
          if (ArrayBuffer.isView(element)) {
            part = new Uint8Array(element.buffer.slice(element.byteOffset, element.byteOffset + element.byteLength));
          } else if (element instanceof ArrayBuffer) {
            part = new Uint8Array(element.slice(0));
          } else if (element instanceof Blob) {
            part = element;
          } else {
            part = encoder.encode(`${element}`);
          }
          this.#size += ArrayBuffer.isView(part) ? part.byteLength : part.size;
          this.#parts.push(part);
        }
        this.#endings = `${options.endings === void 0 ? "transparent" : options.endings}`;
        const type = options.type === void 0 ? "" : String(options.type);
        this.#type = /^[\x20-\x7E]*$/.test(type) ? type : "";
      }
      /**
       * The Blob interface's size property returns the
       * size of the Blob in bytes.
       */
      get size() {
        return this.#size;
      }
      /**
       * The type property of a Blob object returns the MIME type of the file.
       */
      get type() {
        return this.#type;
      }
      /**
       * The text() method in the Blob interface returns a Promise
       * that resolves with a string containing the contents of
       * the blob, interpreted as UTF-8.
       *
       * @return {Promise<string>}
       */
      async text() {
        const decoder = new TextDecoder();
        let str = "";
        for await (const part of toIterator(this.#parts, false)) {
          str += decoder.decode(part, { stream: true });
        }
        str += decoder.decode();
        return str;
      }
      /**
       * The arrayBuffer() method in the Blob interface returns a
       * Promise that resolves with the contents of the blob as
       * binary data contained in an ArrayBuffer.
       *
       * @return {Promise<ArrayBuffer>}
       */
      async arrayBuffer() {
        const data = new Uint8Array(this.size);
        let offset = 0;
        for await (const chunk of toIterator(this.#parts, false)) {
          data.set(chunk, offset);
          offset += chunk.length;
        }
        return data.buffer;
      }
      stream() {
        const it = toIterator(this.#parts, true);
        return new globalThis.ReadableStream({
          // @ts-ignore
          type: "bytes",
          async pull(ctrl) {
            const chunk = await it.next();
            chunk.done ? ctrl.close() : ctrl.enqueue(chunk.value);
          },
          async cancel() {
            await it.return();
          }
        });
      }
      /**
       * The Blob interface's slice() method creates and returns a
       * new Blob object which contains data from a subset of the
       * blob on which it's called.
       *
       * @param {number} [start]
       * @param {number} [end]
       * @param {string} [type]
       */
      slice(start = 0, end = this.size, type = "") {
        const { size } = this;
        let relativeStart = start < 0 ? Math.max(size + start, 0) : Math.min(start, size);
        let relativeEnd = end < 0 ? Math.max(size + end, 0) : Math.min(end, size);
        const span = Math.max(relativeEnd - relativeStart, 0);
        const parts = this.#parts;
        const blobParts = [];
        let added = 0;
        for (const part of parts) {
          if (added >= span) {
            break;
          }
          const size2 = ArrayBuffer.isView(part) ? part.byteLength : part.size;
          if (relativeStart && size2 <= relativeStart) {
            relativeStart -= size2;
            relativeEnd -= size2;
          } else {
            let chunk;
            if (ArrayBuffer.isView(part)) {
              chunk = part.subarray(relativeStart, Math.min(size2, relativeEnd));
              added += chunk.byteLength;
            } else {
              chunk = part.slice(relativeStart, Math.min(size2, relativeEnd));
              added += chunk.size;
            }
            relativeEnd -= size2;
            blobParts.push(chunk);
            relativeStart = 0;
          }
        }
        const blob = new Blob([], { type: String(type).toLowerCase() });
        blob.#size = span;
        blob.#parts = blobParts;
        return blob;
      }
      get [Symbol.toStringTag]() {
        return "Blob";
      }
      static [Symbol.hasInstance](object) {
        return object && typeof object === "object" && typeof object.constructor === "function" && (typeof object.stream === "function" || typeof object.arrayBuffer === "function") && /^(Blob|File)$/.test(object[Symbol.toStringTag]);
      }
    };
    Object.defineProperties(_Blob.prototype, {
      size: { enumerable: true },
      type: { enumerable: true },
      slice: { enumerable: true }
    });
    Blob2 = _Blob;
    fetch_blob_default = Blob2;
  }
});

// node_modules/fetch-blob/file.js
var _File, File2, file_default;
var init_file = __esm({
  "node_modules/fetch-blob/file.js"() {
    init_fetch_blob();
    _File = class File extends fetch_blob_default {
      #lastModified = 0;
      #name = "";
      /**
       * @param {*[]} fileBits
       * @param {string} fileName
       * @param {{lastModified?: number, type?: string}} options
       */
      // @ts-ignore
      constructor(fileBits, fileName, options = {}) {
        if (arguments.length < 2) {
          throw new TypeError(`Failed to construct 'File': 2 arguments required, but only ${arguments.length} present.`);
        }
        super(fileBits, options);
        if (options === null) options = {};
        const lastModified = options.lastModified === void 0 ? Date.now() : Number(options.lastModified);
        if (!Number.isNaN(lastModified)) {
          this.#lastModified = lastModified;
        }
        this.#name = String(fileName);
      }
      get name() {
        return this.#name;
      }
      get lastModified() {
        return this.#lastModified;
      }
      get [Symbol.toStringTag]() {
        return "File";
      }
      static [Symbol.hasInstance](object) {
        return !!object && object instanceof fetch_blob_default && /^(File)$/.test(object[Symbol.toStringTag]);
      }
    };
    File2 = _File;
    file_default = File2;
  }
});

// node_modules/formdata-polyfill/esm.min.js
function formDataToBlob(F2, B = fetch_blob_default) {
  var b = `${r()}${r()}`.replace(/\./g, "").slice(-28).padStart(32, "-"), c = [], p = `--${b}\r
Content-Disposition: form-data; name="`;
  F2.forEach((v, n) => typeof v == "string" ? c.push(p + e(n) + `"\r
\r
${v.replace(/\r(?!\n)|(?<!\r)\n/g, "\r\n")}\r
`) : c.push(p + e(n) + `"; filename="${e(v.name, 1)}"\r
Content-Type: ${v.type || "application/octet-stream"}\r
\r
`, v, "\r\n"));
  c.push(`--${b}--`);
  return new B(c, { type: "multipart/form-data; boundary=" + b });
}
var t, i, h, r, m, f, e, x, FormData;
var init_esm_min = __esm({
  "node_modules/formdata-polyfill/esm.min.js"() {
    init_fetch_blob();
    init_file();
    ({ toStringTag: t, iterator: i, hasInstance: h } = Symbol);
    r = Math.random;
    m = "append,set,get,getAll,delete,keys,values,entries,forEach,constructor".split(",");
    f = (a, b, c) => (a += "", /^(Blob|File)$/.test(b && b[t]) ? [(c = c !== void 0 ? c + "" : b[t] == "File" ? b.name : "blob", a), b.name !== c || b[t] == "blob" ? new file_default([b], c, b) : b] : [a, b + ""]);
    e = (c, f3) => (f3 ? c : c.replace(/\r?\n|\r/g, "\r\n")).replace(/\n/g, "%0A").replace(/\r/g, "%0D").replace(/"/g, "%22");
    x = (n, a, e2) => {
      if (a.length < e2) {
        throw new TypeError(`Failed to execute '${n}' on 'FormData': ${e2} arguments required, but only ${a.length} present.`);
      }
    };
    FormData = class FormData2 {
      #d = [];
      constructor(...a) {
        if (a.length) throw new TypeError(`Failed to construct 'FormData': parameter 1 is not of type 'HTMLFormElement'.`);
      }
      get [t]() {
        return "FormData";
      }
      [i]() {
        return this.entries();
      }
      static [h](o) {
        return o && typeof o === "object" && o[t] === "FormData" && !m.some((m2) => typeof o[m2] != "function");
      }
      append(...a) {
        x("append", arguments, 2);
        this.#d.push(f(...a));
      }
      delete(a) {
        x("delete", arguments, 1);
        a += "";
        this.#d = this.#d.filter(([b]) => b !== a);
      }
      get(a) {
        x("get", arguments, 1);
        a += "";
        for (var b = this.#d, l = b.length, c = 0; c < l; c++) if (b[c][0] === a) return b[c][1];
        return null;
      }
      getAll(a, b) {
        x("getAll", arguments, 1);
        b = [];
        a += "";
        this.#d.forEach((c) => c[0] === a && b.push(c[1]));
        return b;
      }
      has(a) {
        x("has", arguments, 1);
        a += "";
        return this.#d.some((b) => b[0] === a);
      }
      forEach(a, b) {
        x("forEach", arguments, 1);
        for (var [c, d] of this) a.call(b, d, c, this);
      }
      set(...a) {
        x("set", arguments, 2);
        var b = [], c = true;
        a = f(...a);
        this.#d.forEach((d) => {
          d[0] === a[0] ? c && (c = !b.push(a)) : b.push(d);
        });
        c && b.push(a);
        this.#d = b;
      }
      *entries() {
        yield* this.#d;
      }
      *keys() {
        for (var [a] of this) yield a;
      }
      *values() {
        for (var [, a] of this) yield a;
      }
    };
  }
});

// node_modules/node-fetch/src/errors/base.js
var FetchBaseError;
var init_base = __esm({
  "node_modules/node-fetch/src/errors/base.js"() {
    FetchBaseError = class extends Error {
      constructor(message, type) {
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.type = type;
      }
      get name() {
        return this.constructor.name;
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
    };
  }
});

// node_modules/node-fetch/src/errors/fetch-error.js
var FetchError;
var init_fetch_error = __esm({
  "node_modules/node-fetch/src/errors/fetch-error.js"() {
    init_base();
    FetchError = class extends FetchBaseError {
      /**
       * @param  {string} message -      Error message for human
       * @param  {string} [type] -        Error type for machine
       * @param  {SystemError} [systemError] - For Node.js system error
       */
      constructor(message, type, systemError) {
        super(message, type);
        if (systemError) {
          this.code = this.errno = systemError.code;
          this.erroredSysCall = systemError.syscall;
        }
      }
    };
  }
});

// node_modules/node-fetch/src/utils/is.js
var NAME, isURLSearchParameters, isBlob, isAbortSignal, isDomainOrSubdomain, isSameProtocol;
var init_is = __esm({
  "node_modules/node-fetch/src/utils/is.js"() {
    NAME = Symbol.toStringTag;
    isURLSearchParameters = (object) => {
      return typeof object === "object" && typeof object.append === "function" && typeof object.delete === "function" && typeof object.get === "function" && typeof object.getAll === "function" && typeof object.has === "function" && typeof object.set === "function" && typeof object.sort === "function" && object[NAME] === "URLSearchParams";
    };
    isBlob = (object) => {
      return object && typeof object === "object" && typeof object.arrayBuffer === "function" && typeof object.type === "string" && typeof object.stream === "function" && typeof object.constructor === "function" && /^(Blob|File)$/.test(object[NAME]);
    };
    isAbortSignal = (object) => {
      return typeof object === "object" && (object[NAME] === "AbortSignal" || object[NAME] === "EventTarget");
    };
    isDomainOrSubdomain = (destination, original) => {
      const orig = new URL(original).hostname;
      const dest = new URL(destination).hostname;
      return orig === dest || orig.endsWith(`.${dest}`);
    };
    isSameProtocol = (destination, original) => {
      const orig = new URL(original).protocol;
      const dest = new URL(destination).protocol;
      return orig === dest;
    };
  }
});

// node_modules/node-domexception/index.js
var require_node_domexception = __commonJS({
  "node_modules/node-domexception/index.js"(exports2, module2) {
    if (!globalThis.DOMException) {
      try {
        const { MessageChannel } = require("worker_threads"), port = new MessageChannel().port1, ab = new ArrayBuffer();
        port.postMessage(ab, [ab, ab]);
      } catch (err) {
        err.constructor.name === "DOMException" && (globalThis.DOMException = err.constructor);
      }
    }
    module2.exports = globalThis.DOMException;
  }
});

// node_modules/fetch-blob/from.js
var import_node_fs, import_node_path, import_node_domexception, stat, blobFromSync, blobFrom, fileFrom, fileFromSync, fromBlob, fromFile, BlobDataItem;
var init_from = __esm({
  "node_modules/fetch-blob/from.js"() {
    import_node_fs = require("node:fs");
    import_node_path = require("node:path");
    import_node_domexception = __toESM(require_node_domexception(), 1);
    init_file();
    init_fetch_blob();
    ({ stat } = import_node_fs.promises);
    blobFromSync = (path3, type) => fromBlob((0, import_node_fs.statSync)(path3), path3, type);
    blobFrom = (path3, type) => stat(path3).then((stat2) => fromBlob(stat2, path3, type));
    fileFrom = (path3, type) => stat(path3).then((stat2) => fromFile(stat2, path3, type));
    fileFromSync = (path3, type) => fromFile((0, import_node_fs.statSync)(path3), path3, type);
    fromBlob = (stat2, path3, type = "") => new fetch_blob_default([new BlobDataItem({
      path: path3,
      size: stat2.size,
      lastModified: stat2.mtimeMs,
      start: 0
    })], { type });
    fromFile = (stat2, path3, type = "") => new file_default([new BlobDataItem({
      path: path3,
      size: stat2.size,
      lastModified: stat2.mtimeMs,
      start: 0
    })], (0, import_node_path.basename)(path3), { type, lastModified: stat2.mtimeMs });
    BlobDataItem = class _BlobDataItem {
      #path;
      #start;
      constructor(options) {
        this.#path = options.path;
        this.#start = options.start;
        this.size = options.size;
        this.lastModified = options.lastModified;
      }
      /**
       * Slicing arguments is first validated and formatted
       * to not be out of range by Blob.prototype.slice
       */
      slice(start, end) {
        return new _BlobDataItem({
          path: this.#path,
          lastModified: this.lastModified,
          size: end - start,
          start: this.#start + start
        });
      }
      async *stream() {
        const { mtimeMs } = await stat(this.#path);
        if (mtimeMs > this.lastModified) {
          throw new import_node_domexception.default("The requested file could not be read, typically due to permission problems that have occurred after a reference to a file was acquired.", "NotReadableError");
        }
        yield* (0, import_node_fs.createReadStream)(this.#path, {
          start: this.#start,
          end: this.#start + this.size - 1
        });
      }
      get [Symbol.toStringTag]() {
        return "Blob";
      }
    };
  }
});

// node_modules/node-fetch/src/utils/multipart-parser.js
var multipart_parser_exports = {};
__export(multipart_parser_exports, {
  toFormData: () => toFormData
});
function _fileName(headerValue) {
  const m2 = headerValue.match(/\bfilename=("(.*?)"|([^()<>@,;:\\"/[\]?={}\s\t]+))($|;\s)/i);
  if (!m2) {
    return;
  }
  const match = m2[2] || m2[3] || "";
  let filename = match.slice(match.lastIndexOf("\\") + 1);
  filename = filename.replace(/%22/g, '"');
  filename = filename.replace(/&#(\d{4});/g, (m3, code) => {
    return String.fromCharCode(code);
  });
  return filename;
}
async function toFormData(Body2, ct) {
  if (!/multipart/i.test(ct)) {
    throw new TypeError("Failed to fetch");
  }
  const m2 = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!m2) {
    throw new TypeError("no or bad content-type header, no multipart boundary");
  }
  const parser = new MultipartParser(m2[1] || m2[2]);
  let headerField;
  let headerValue;
  let entryValue;
  let entryName;
  let contentType;
  let filename;
  const entryChunks = [];
  const formData = new FormData();
  const onPartData = (ui8a) => {
    entryValue += decoder.decode(ui8a, { stream: true });
  };
  const appendToFile = (ui8a) => {
    entryChunks.push(ui8a);
  };
  const appendFileToFormData = () => {
    const file = new file_default(entryChunks, filename, { type: contentType });
    formData.append(entryName, file);
  };
  const appendEntryToFormData = () => {
    formData.append(entryName, entryValue);
  };
  const decoder = new TextDecoder("utf-8");
  decoder.decode();
  parser.onPartBegin = function() {
    parser.onPartData = onPartData;
    parser.onPartEnd = appendEntryToFormData;
    headerField = "";
    headerValue = "";
    entryValue = "";
    entryName = "";
    contentType = "";
    filename = null;
    entryChunks.length = 0;
  };
  parser.onHeaderField = function(ui8a) {
    headerField += decoder.decode(ui8a, { stream: true });
  };
  parser.onHeaderValue = function(ui8a) {
    headerValue += decoder.decode(ui8a, { stream: true });
  };
  parser.onHeaderEnd = function() {
    headerValue += decoder.decode();
    headerField = headerField.toLowerCase();
    if (headerField === "content-disposition") {
      const m3 = headerValue.match(/\bname=("([^"]*)"|([^()<>@,;:\\"/[\]?={}\s\t]+))/i);
      if (m3) {
        entryName = m3[2] || m3[3] || "";
      }
      filename = _fileName(headerValue);
      if (filename) {
        parser.onPartData = appendToFile;
        parser.onPartEnd = appendFileToFormData;
      }
    } else if (headerField === "content-type") {
      contentType = headerValue;
    }
    headerValue = "";
    headerField = "";
  };
  for await (const chunk of Body2) {
    parser.write(chunk);
  }
  parser.end();
  return formData;
}
var s, S, f2, F, LF, CR, SPACE, HYPHEN, COLON, A, Z, lower, noop, MultipartParser;
var init_multipart_parser = __esm({
  "node_modules/node-fetch/src/utils/multipart-parser.js"() {
    init_from();
    init_esm_min();
    s = 0;
    S = {
      START_BOUNDARY: s++,
      HEADER_FIELD_START: s++,
      HEADER_FIELD: s++,
      HEADER_VALUE_START: s++,
      HEADER_VALUE: s++,
      HEADER_VALUE_ALMOST_DONE: s++,
      HEADERS_ALMOST_DONE: s++,
      PART_DATA_START: s++,
      PART_DATA: s++,
      END: s++
    };
    f2 = 1;
    F = {
      PART_BOUNDARY: f2,
      LAST_BOUNDARY: f2 *= 2
    };
    LF = 10;
    CR = 13;
    SPACE = 32;
    HYPHEN = 45;
    COLON = 58;
    A = 97;
    Z = 122;
    lower = (c) => c | 32;
    noop = () => {
    };
    MultipartParser = class {
      /**
       * @param {string} boundary
       */
      constructor(boundary) {
        this.index = 0;
        this.flags = 0;
        this.onHeaderEnd = noop;
        this.onHeaderField = noop;
        this.onHeadersEnd = noop;
        this.onHeaderValue = noop;
        this.onPartBegin = noop;
        this.onPartData = noop;
        this.onPartEnd = noop;
        this.boundaryChars = {};
        boundary = "\r\n--" + boundary;
        const ui8a = new Uint8Array(boundary.length);
        for (let i2 = 0; i2 < boundary.length; i2++) {
          ui8a[i2] = boundary.charCodeAt(i2);
          this.boundaryChars[ui8a[i2]] = true;
        }
        this.boundary = ui8a;
        this.lookbehind = new Uint8Array(this.boundary.length + 8);
        this.state = S.START_BOUNDARY;
      }
      /**
       * @param {Uint8Array} data
       */
      write(data) {
        let i2 = 0;
        const length_ = data.length;
        let previousIndex = this.index;
        let { lookbehind, boundary, boundaryChars, index, state, flags } = this;
        const boundaryLength = this.boundary.length;
        const boundaryEnd = boundaryLength - 1;
        const bufferLength = data.length;
        let c;
        let cl;
        const mark = (name) => {
          this[name + "Mark"] = i2;
        };
        const clear = (name) => {
          delete this[name + "Mark"];
        };
        const callback = (callbackSymbol, start, end, ui8a) => {
          if (start === void 0 || start !== end) {
            this[callbackSymbol](ui8a && ui8a.subarray(start, end));
          }
        };
        const dataCallback = (name, clear2) => {
          const markSymbol = name + "Mark";
          if (!(markSymbol in this)) {
            return;
          }
          if (clear2) {
            callback(name, this[markSymbol], i2, data);
            delete this[markSymbol];
          } else {
            callback(name, this[markSymbol], data.length, data);
            this[markSymbol] = 0;
          }
        };
        for (i2 = 0; i2 < length_; i2++) {
          c = data[i2];
          switch (state) {
            case S.START_BOUNDARY:
              if (index === boundary.length - 2) {
                if (c === HYPHEN) {
                  flags |= F.LAST_BOUNDARY;
                } else if (c !== CR) {
                  return;
                }
                index++;
                break;
              } else if (index - 1 === boundary.length - 2) {
                if (flags & F.LAST_BOUNDARY && c === HYPHEN) {
                  state = S.END;
                  flags = 0;
                } else if (!(flags & F.LAST_BOUNDARY) && c === LF) {
                  index = 0;
                  callback("onPartBegin");
                  state = S.HEADER_FIELD_START;
                } else {
                  return;
                }
                break;
              }
              if (c !== boundary[index + 2]) {
                index = -2;
              }
              if (c === boundary[index + 2]) {
                index++;
              }
              break;
            case S.HEADER_FIELD_START:
              state = S.HEADER_FIELD;
              mark("onHeaderField");
              index = 0;
            // falls through
            case S.HEADER_FIELD:
              if (c === CR) {
                clear("onHeaderField");
                state = S.HEADERS_ALMOST_DONE;
                break;
              }
              index++;
              if (c === HYPHEN) {
                break;
              }
              if (c === COLON) {
                if (index === 1) {
                  return;
                }
                dataCallback("onHeaderField", true);
                state = S.HEADER_VALUE_START;
                break;
              }
              cl = lower(c);
              if (cl < A || cl > Z) {
                return;
              }
              break;
            case S.HEADER_VALUE_START:
              if (c === SPACE) {
                break;
              }
              mark("onHeaderValue");
              state = S.HEADER_VALUE;
            // falls through
            case S.HEADER_VALUE:
              if (c === CR) {
                dataCallback("onHeaderValue", true);
                callback("onHeaderEnd");
                state = S.HEADER_VALUE_ALMOST_DONE;
              }
              break;
            case S.HEADER_VALUE_ALMOST_DONE:
              if (c !== LF) {
                return;
              }
              state = S.HEADER_FIELD_START;
              break;
            case S.HEADERS_ALMOST_DONE:
              if (c !== LF) {
                return;
              }
              callback("onHeadersEnd");
              state = S.PART_DATA_START;
              break;
            case S.PART_DATA_START:
              state = S.PART_DATA;
              mark("onPartData");
            // falls through
            case S.PART_DATA:
              previousIndex = index;
              if (index === 0) {
                i2 += boundaryEnd;
                while (i2 < bufferLength && !(data[i2] in boundaryChars)) {
                  i2 += boundaryLength;
                }
                i2 -= boundaryEnd;
                c = data[i2];
              }
              if (index < boundary.length) {
                if (boundary[index] === c) {
                  if (index === 0) {
                    dataCallback("onPartData", true);
                  }
                  index++;
                } else {
                  index = 0;
                }
              } else if (index === boundary.length) {
                index++;
                if (c === CR) {
                  flags |= F.PART_BOUNDARY;
                } else if (c === HYPHEN) {
                  flags |= F.LAST_BOUNDARY;
                } else {
                  index = 0;
                }
              } else if (index - 1 === boundary.length) {
                if (flags & F.PART_BOUNDARY) {
                  index = 0;
                  if (c === LF) {
                    flags &= ~F.PART_BOUNDARY;
                    callback("onPartEnd");
                    callback("onPartBegin");
                    state = S.HEADER_FIELD_START;
                    break;
                  }
                } else if (flags & F.LAST_BOUNDARY) {
                  if (c === HYPHEN) {
                    callback("onPartEnd");
                    state = S.END;
                    flags = 0;
                  } else {
                    index = 0;
                  }
                } else {
                  index = 0;
                }
              }
              if (index > 0) {
                lookbehind[index - 1] = c;
              } else if (previousIndex > 0) {
                const _lookbehind = new Uint8Array(lookbehind.buffer, lookbehind.byteOffset, lookbehind.byteLength);
                callback("onPartData", 0, previousIndex, _lookbehind);
                previousIndex = 0;
                mark("onPartData");
                i2--;
              }
              break;
            case S.END:
              break;
            default:
              throw new Error(`Unexpected state entered: ${state}`);
          }
        }
        dataCallback("onHeaderField");
        dataCallback("onHeaderValue");
        dataCallback("onPartData");
        this.index = index;
        this.state = state;
        this.flags = flags;
      }
      end() {
        if (this.state === S.HEADER_FIELD_START && this.index === 0 || this.state === S.PART_DATA && this.index === this.boundary.length) {
          this.onPartEnd();
        } else if (this.state !== S.END) {
          throw new Error("MultipartParser.end(): stream ended unexpectedly");
        }
      }
    };
  }
});

// node_modules/node-fetch/src/body.js
async function consumeBody(data) {
  if (data[INTERNALS].disturbed) {
    throw new TypeError(`body used already for: ${data.url}`);
  }
  data[INTERNALS].disturbed = true;
  if (data[INTERNALS].error) {
    throw data[INTERNALS].error;
  }
  const { body } = data;
  if (body === null) {
    return import_node_buffer2.Buffer.alloc(0);
  }
  if (!(body instanceof import_node_stream.default)) {
    return import_node_buffer2.Buffer.alloc(0);
  }
  const accum = [];
  let accumBytes = 0;
  try {
    for await (const chunk of body) {
      if (data.size > 0 && accumBytes + chunk.length > data.size) {
        const error = new FetchError(`content size at ${data.url} over limit: ${data.size}`, "max-size");
        body.destroy(error);
        throw error;
      }
      accumBytes += chunk.length;
      accum.push(chunk);
    }
  } catch (error) {
    const error_ = error instanceof FetchBaseError ? error : new FetchError(`Invalid response body while trying to fetch ${data.url}: ${error.message}`, "system", error);
    throw error_;
  }
  if (body.readableEnded === true || body._readableState.ended === true) {
    try {
      if (accum.every((c) => typeof c === "string")) {
        return import_node_buffer2.Buffer.from(accum.join(""));
      }
      return import_node_buffer2.Buffer.concat(accum, accumBytes);
    } catch (error) {
      throw new FetchError(`Could not create Buffer from response body for ${data.url}: ${error.message}`, "system", error);
    }
  } else {
    throw new FetchError(`Premature close of server response while trying to fetch ${data.url}`);
  }
}
var import_node_stream, import_node_util, import_node_buffer2, pipeline, INTERNALS, Body, clone, getNonSpecFormDataBoundary, extractContentType, getTotalBytes, writeToStream;
var init_body = __esm({
  "node_modules/node-fetch/src/body.js"() {
    import_node_stream = __toESM(require("node:stream"), 1);
    import_node_util = require("node:util");
    import_node_buffer2 = require("node:buffer");
    init_fetch_blob();
    init_esm_min();
    init_fetch_error();
    init_base();
    init_is();
    pipeline = (0, import_node_util.promisify)(import_node_stream.default.pipeline);
    INTERNALS = /* @__PURE__ */ Symbol("Body internals");
    Body = class {
      constructor(body, {
        size = 0
      } = {}) {
        let boundary = null;
        if (body === null) {
          body = null;
        } else if (isURLSearchParameters(body)) {
          body = import_node_buffer2.Buffer.from(body.toString());
        } else if (isBlob(body)) {
        } else if (import_node_buffer2.Buffer.isBuffer(body)) {
        } else if (import_node_util.types.isAnyArrayBuffer(body)) {
          body = import_node_buffer2.Buffer.from(body);
        } else if (ArrayBuffer.isView(body)) {
          body = import_node_buffer2.Buffer.from(body.buffer, body.byteOffset, body.byteLength);
        } else if (body instanceof import_node_stream.default) {
        } else if (body instanceof FormData) {
          body = formDataToBlob(body);
          boundary = body.type.split("=")[1];
        } else {
          body = import_node_buffer2.Buffer.from(String(body));
        }
        let stream = body;
        if (import_node_buffer2.Buffer.isBuffer(body)) {
          stream = import_node_stream.default.Readable.from(body);
        } else if (isBlob(body)) {
          stream = import_node_stream.default.Readable.from(body.stream());
        }
        this[INTERNALS] = {
          body,
          stream,
          boundary,
          disturbed: false,
          error: null
        };
        this.size = size;
        if (body instanceof import_node_stream.default) {
          body.on("error", (error_) => {
            const error = error_ instanceof FetchBaseError ? error_ : new FetchError(`Invalid response body while trying to fetch ${this.url}: ${error_.message}`, "system", error_);
            this[INTERNALS].error = error;
          });
        }
      }
      get body() {
        return this[INTERNALS].stream;
      }
      get bodyUsed() {
        return this[INTERNALS].disturbed;
      }
      /**
       * Decode response as ArrayBuffer
       *
       * @return  Promise
       */
      async arrayBuffer() {
        const { buffer, byteOffset, byteLength } = await consumeBody(this);
        return buffer.slice(byteOffset, byteOffset + byteLength);
      }
      async formData() {
        const ct = this.headers.get("content-type");
        if (ct.startsWith("application/x-www-form-urlencoded")) {
          const formData = new FormData();
          const parameters = new URLSearchParams(await this.text());
          for (const [name, value] of parameters) {
            formData.append(name, value);
          }
          return formData;
        }
        const { toFormData: toFormData2 } = await Promise.resolve().then(() => (init_multipart_parser(), multipart_parser_exports));
        return toFormData2(this.body, ct);
      }
      /**
       * Return raw response as Blob
       *
       * @return Promise
       */
      async blob() {
        const ct = this.headers && this.headers.get("content-type") || this[INTERNALS].body && this[INTERNALS].body.type || "";
        const buf = await this.arrayBuffer();
        return new fetch_blob_default([buf], {
          type: ct
        });
      }
      /**
       * Decode response as json
       *
       * @return  Promise
       */
      async json() {
        const text = await this.text();
        return JSON.parse(text);
      }
      /**
       * Decode response as text
       *
       * @return  Promise
       */
      async text() {
        const buffer = await consumeBody(this);
        return new TextDecoder().decode(buffer);
      }
      /**
       * Decode response as buffer (non-spec api)
       *
       * @return  Promise
       */
      buffer() {
        return consumeBody(this);
      }
    };
    Body.prototype.buffer = (0, import_node_util.deprecate)(Body.prototype.buffer, "Please use 'response.arrayBuffer()' instead of 'response.buffer()'", "node-fetch#buffer");
    Object.defineProperties(Body.prototype, {
      body: { enumerable: true },
      bodyUsed: { enumerable: true },
      arrayBuffer: { enumerable: true },
      blob: { enumerable: true },
      json: { enumerable: true },
      text: { enumerable: true },
      data: { get: (0, import_node_util.deprecate)(
        () => {
        },
        "data doesn't exist, use json(), text(), arrayBuffer(), or body instead",
        "https://github.com/node-fetch/node-fetch/issues/1000 (response)"
      ) }
    });
    clone = (instance, highWaterMark) => {
      let p1;
      let p2;
      let { body } = instance[INTERNALS];
      if (instance.bodyUsed) {
        throw new Error("cannot clone body after it is used");
      }
      if (body instanceof import_node_stream.default && typeof body.getBoundary !== "function") {
        p1 = new import_node_stream.PassThrough({ highWaterMark });
        p2 = new import_node_stream.PassThrough({ highWaterMark });
        body.pipe(p1);
        body.pipe(p2);
        instance[INTERNALS].stream = p1;
        body = p2;
      }
      return body;
    };
    getNonSpecFormDataBoundary = (0, import_node_util.deprecate)(
      (body) => body.getBoundary(),
      "form-data doesn't follow the spec and requires special treatment. Use alternative package",
      "https://github.com/node-fetch/node-fetch/issues/1167"
    );
    extractContentType = (body, request) => {
      if (body === null) {
        return null;
      }
      if (typeof body === "string") {
        return "text/plain;charset=UTF-8";
      }
      if (isURLSearchParameters(body)) {
        return "application/x-www-form-urlencoded;charset=UTF-8";
      }
      if (isBlob(body)) {
        return body.type || null;
      }
      if (import_node_buffer2.Buffer.isBuffer(body) || import_node_util.types.isAnyArrayBuffer(body) || ArrayBuffer.isView(body)) {
        return null;
      }
      if (body instanceof FormData) {
        return `multipart/form-data; boundary=${request[INTERNALS].boundary}`;
      }
      if (body && typeof body.getBoundary === "function") {
        return `multipart/form-data;boundary=${getNonSpecFormDataBoundary(body)}`;
      }
      if (body instanceof import_node_stream.default) {
        return null;
      }
      return "text/plain;charset=UTF-8";
    };
    getTotalBytes = (request) => {
      const { body } = request[INTERNALS];
      if (body === null) {
        return 0;
      }
      if (isBlob(body)) {
        return body.size;
      }
      if (import_node_buffer2.Buffer.isBuffer(body)) {
        return body.length;
      }
      if (body && typeof body.getLengthSync === "function") {
        return body.hasKnownLength && body.hasKnownLength() ? body.getLengthSync() : null;
      }
      return null;
    };
    writeToStream = async (dest, { body }) => {
      if (body === null) {
        dest.end();
      } else {
        await pipeline(body, dest);
      }
    };
  }
});

// node_modules/node-fetch/src/headers.js
function fromRawHeaders(headers = []) {
  return new Headers(
    headers.reduce((result, value, index, array) => {
      if (index % 2 === 0) {
        result.push(array.slice(index, index + 2));
      }
      return result;
    }, []).filter(([name, value]) => {
      try {
        validateHeaderName(name);
        validateHeaderValue(name, String(value));
        return true;
      } catch {
        return false;
      }
    })
  );
}
var import_node_util2, import_node_http, validateHeaderName, validateHeaderValue, Headers;
var init_headers = __esm({
  "node_modules/node-fetch/src/headers.js"() {
    import_node_util2 = require("node:util");
    import_node_http = __toESM(require("node:http"), 1);
    validateHeaderName = typeof import_node_http.default.validateHeaderName === "function" ? import_node_http.default.validateHeaderName : (name) => {
      if (!/^[\^`\-\w!#$%&'*+.|~]+$/.test(name)) {
        const error = new TypeError(`Header name must be a valid HTTP token [${name}]`);
        Object.defineProperty(error, "code", { value: "ERR_INVALID_HTTP_TOKEN" });
        throw error;
      }
    };
    validateHeaderValue = typeof import_node_http.default.validateHeaderValue === "function" ? import_node_http.default.validateHeaderValue : (name, value) => {
      if (/[^\t\u0020-\u007E\u0080-\u00FF]/.test(value)) {
        const error = new TypeError(`Invalid character in header content ["${name}"]`);
        Object.defineProperty(error, "code", { value: "ERR_INVALID_CHAR" });
        throw error;
      }
    };
    Headers = class _Headers extends URLSearchParams {
      /**
       * Headers class
       *
       * @constructor
       * @param {HeadersInit} [init] - Response headers
       */
      constructor(init) {
        let result = [];
        if (init instanceof _Headers) {
          const raw = init.raw();
          for (const [name, values] of Object.entries(raw)) {
            result.push(...values.map((value) => [name, value]));
          }
        } else if (init == null) {
        } else if (typeof init === "object" && !import_node_util2.types.isBoxedPrimitive(init)) {
          const method = init[Symbol.iterator];
          if (method == null) {
            result.push(...Object.entries(init));
          } else {
            if (typeof method !== "function") {
              throw new TypeError("Header pairs must be iterable");
            }
            result = [...init].map((pair) => {
              if (typeof pair !== "object" || import_node_util2.types.isBoxedPrimitive(pair)) {
                throw new TypeError("Each header pair must be an iterable object");
              }
              return [...pair];
            }).map((pair) => {
              if (pair.length !== 2) {
                throw new TypeError("Each header pair must be a name/value tuple");
              }
              return [...pair];
            });
          }
        } else {
          throw new TypeError("Failed to construct 'Headers': The provided value is not of type '(sequence<sequence<ByteString>> or record<ByteString, ByteString>)");
        }
        result = result.length > 0 ? result.map(([name, value]) => {
          validateHeaderName(name);
          validateHeaderValue(name, String(value));
          return [String(name).toLowerCase(), String(value)];
        }) : void 0;
        super(result);
        return new Proxy(this, {
          get(target, p, receiver) {
            switch (p) {
              case "append":
              case "set":
                return (name, value) => {
                  validateHeaderName(name);
                  validateHeaderValue(name, String(value));
                  return URLSearchParams.prototype[p].call(
                    target,
                    String(name).toLowerCase(),
                    String(value)
                  );
                };
              case "delete":
              case "has":
              case "getAll":
                return (name) => {
                  validateHeaderName(name);
                  return URLSearchParams.prototype[p].call(
                    target,
                    String(name).toLowerCase()
                  );
                };
              case "keys":
                return () => {
                  target.sort();
                  return new Set(URLSearchParams.prototype.keys.call(target)).keys();
                };
              default:
                return Reflect.get(target, p, receiver);
            }
          }
        });
      }
      get [Symbol.toStringTag]() {
        return this.constructor.name;
      }
      toString() {
        return Object.prototype.toString.call(this);
      }
      get(name) {
        const values = this.getAll(name);
        if (values.length === 0) {
          return null;
        }
        let value = values.join(", ");
        if (/^content-encoding$/i.test(name)) {
          value = value.toLowerCase();
        }
        return value;
      }
      forEach(callback, thisArg = void 0) {
        for (const name of this.keys()) {
          Reflect.apply(callback, thisArg, [this.get(name), name, this]);
        }
      }
      *values() {
        for (const name of this.keys()) {
          yield this.get(name);
        }
      }
      /**
       * @type {() => IterableIterator<[string, string]>}
       */
      *entries() {
        for (const name of this.keys()) {
          yield [name, this.get(name)];
        }
      }
      [Symbol.iterator]() {
        return this.entries();
      }
      /**
       * Node-fetch non-spec method
       * returning all headers and their values as array
       * @returns {Record<string, string[]>}
       */
      raw() {
        return [...this.keys()].reduce((result, key) => {
          result[key] = this.getAll(key);
          return result;
        }, {});
      }
      /**
       * For better console.log(headers) and also to convert Headers into Node.js Request compatible format
       */
      [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
        return [...this.keys()].reduce((result, key) => {
          const values = this.getAll(key);
          if (key === "host") {
            result[key] = values[0];
          } else {
            result[key] = values.length > 1 ? values : values[0];
          }
          return result;
        }, {});
      }
    };
    Object.defineProperties(
      Headers.prototype,
      ["get", "entries", "forEach", "values"].reduce((result, property) => {
        result[property] = { enumerable: true };
        return result;
      }, {})
    );
  }
});

// node_modules/node-fetch/src/utils/is-redirect.js
var redirectStatus, isRedirect;
var init_is_redirect = __esm({
  "node_modules/node-fetch/src/utils/is-redirect.js"() {
    redirectStatus = /* @__PURE__ */ new Set([301, 302, 303, 307, 308]);
    isRedirect = (code) => {
      return redirectStatus.has(code);
    };
  }
});

// node_modules/node-fetch/src/response.js
var INTERNALS2, Response;
var init_response = __esm({
  "node_modules/node-fetch/src/response.js"() {
    init_headers();
    init_body();
    init_is_redirect();
    INTERNALS2 = /* @__PURE__ */ Symbol("Response internals");
    Response = class _Response extends Body {
      constructor(body = null, options = {}) {
        super(body, options);
        const status = options.status != null ? options.status : 200;
        const headers = new Headers(options.headers);
        if (body !== null && !headers.has("Content-Type")) {
          const contentType = extractContentType(body, this);
          if (contentType) {
            headers.append("Content-Type", contentType);
          }
        }
        this[INTERNALS2] = {
          type: "default",
          url: options.url,
          status,
          statusText: options.statusText || "",
          headers,
          counter: options.counter,
          highWaterMark: options.highWaterMark
        };
      }
      get type() {
        return this[INTERNALS2].type;
      }
      get url() {
        return this[INTERNALS2].url || "";
      }
      get status() {
        return this[INTERNALS2].status;
      }
      /**
       * Convenience property representing if the request ended normally
       */
      get ok() {
        return this[INTERNALS2].status >= 200 && this[INTERNALS2].status < 300;
      }
      get redirected() {
        return this[INTERNALS2].counter > 0;
      }
      get statusText() {
        return this[INTERNALS2].statusText;
      }
      get headers() {
        return this[INTERNALS2].headers;
      }
      get highWaterMark() {
        return this[INTERNALS2].highWaterMark;
      }
      /**
       * Clone this response
       *
       * @return  Response
       */
      clone() {
        return new _Response(clone(this, this.highWaterMark), {
          type: this.type,
          url: this.url,
          status: this.status,
          statusText: this.statusText,
          headers: this.headers,
          ok: this.ok,
          redirected: this.redirected,
          size: this.size,
          highWaterMark: this.highWaterMark
        });
      }
      /**
       * @param {string} url    The URL that the new response is to originate from.
       * @param {number} status An optional status code for the response (e.g., 302.)
       * @returns {Response}    A Response object.
       */
      static redirect(url, status = 302) {
        if (!isRedirect(status)) {
          throw new RangeError('Failed to execute "redirect" on "response": Invalid status code');
        }
        return new _Response(null, {
          headers: {
            location: new URL(url).toString()
          },
          status
        });
      }
      static error() {
        const response = new _Response(null, { status: 0, statusText: "" });
        response[INTERNALS2].type = "error";
        return response;
      }
      static json(data = void 0, init = {}) {
        const body = JSON.stringify(data);
        if (body === void 0) {
          throw new TypeError("data is not JSON serializable");
        }
        const headers = new Headers(init && init.headers);
        if (!headers.has("content-type")) {
          headers.set("content-type", "application/json");
        }
        return new _Response(body, {
          ...init,
          headers
        });
      }
      get [Symbol.toStringTag]() {
        return "Response";
      }
    };
    Object.defineProperties(Response.prototype, {
      type: { enumerable: true },
      url: { enumerable: true },
      status: { enumerable: true },
      ok: { enumerable: true },
      redirected: { enumerable: true },
      statusText: { enumerable: true },
      headers: { enumerable: true },
      clone: { enumerable: true }
    });
  }
});

// node_modules/node-fetch/src/utils/get-search.js
var getSearch;
var init_get_search = __esm({
  "node_modules/node-fetch/src/utils/get-search.js"() {
    getSearch = (parsedURL) => {
      if (parsedURL.search) {
        return parsedURL.search;
      }
      const lastOffset = parsedURL.href.length - 1;
      const hash = parsedURL.hash || (parsedURL.href[lastOffset] === "#" ? "#" : "");
      return parsedURL.href[lastOffset - hash.length] === "?" ? "?" : "";
    };
  }
});

// node_modules/node-fetch/src/utils/referrer.js
function stripURLForUseAsAReferrer(url, originOnly = false) {
  if (url == null) {
    return "no-referrer";
  }
  url = new URL(url);
  if (/^(about|blob|data):$/.test(url.protocol)) {
    return "no-referrer";
  }
  url.username = "";
  url.password = "";
  url.hash = "";
  if (originOnly) {
    url.pathname = "";
    url.search = "";
  }
  return url;
}
function validateReferrerPolicy(referrerPolicy) {
  if (!ReferrerPolicy.has(referrerPolicy)) {
    throw new TypeError(`Invalid referrerPolicy: ${referrerPolicy}`);
  }
  return referrerPolicy;
}
function isOriginPotentiallyTrustworthy(url) {
  if (/^(http|ws)s:$/.test(url.protocol)) {
    return true;
  }
  const hostIp = url.host.replace(/(^\[)|(]$)/g, "");
  const hostIPVersion = (0, import_node_net4.isIP)(hostIp);
  if (hostIPVersion === 4 && /^127\./.test(hostIp)) {
    return true;
  }
  if (hostIPVersion === 6 && /^(((0+:){7})|(::(0+:){0,6}))0*1$/.test(hostIp)) {
    return true;
  }
  if (url.host === "localhost" || url.host.endsWith(".localhost")) {
    return false;
  }
  if (url.protocol === "file:") {
    return true;
  }
  return false;
}
function isUrlPotentiallyTrustworthy(url) {
  if (/^about:(blank|srcdoc)$/.test(url)) {
    return true;
  }
  if (url.protocol === "data:") {
    return true;
  }
  if (/^(blob|filesystem):$/.test(url.protocol)) {
    return true;
  }
  return isOriginPotentiallyTrustworthy(url);
}
function determineRequestsReferrer(request, { referrerURLCallback, referrerOriginCallback } = {}) {
  if (request.referrer === "no-referrer" || request.referrerPolicy === "") {
    return null;
  }
  const policy = request.referrerPolicy;
  if (request.referrer === "about:client") {
    return "no-referrer";
  }
  const referrerSource = request.referrer;
  let referrerURL = stripURLForUseAsAReferrer(referrerSource);
  let referrerOrigin = stripURLForUseAsAReferrer(referrerSource, true);
  if (referrerURL.toString().length > 4096) {
    referrerURL = referrerOrigin;
  }
  if (referrerURLCallback) {
    referrerURL = referrerURLCallback(referrerURL);
  }
  if (referrerOriginCallback) {
    referrerOrigin = referrerOriginCallback(referrerOrigin);
  }
  const currentURL = new URL(request.url);
  switch (policy) {
    case "no-referrer":
      return "no-referrer";
    case "origin":
      return referrerOrigin;
    case "unsafe-url":
      return referrerURL;
    case "strict-origin":
      if (isUrlPotentiallyTrustworthy(referrerURL) && !isUrlPotentiallyTrustworthy(currentURL)) {
        return "no-referrer";
      }
      return referrerOrigin.toString();
    case "strict-origin-when-cross-origin":
      if (referrerURL.origin === currentURL.origin) {
        return referrerURL;
      }
      if (isUrlPotentiallyTrustworthy(referrerURL) && !isUrlPotentiallyTrustworthy(currentURL)) {
        return "no-referrer";
      }
      return referrerOrigin;
    case "same-origin":
      if (referrerURL.origin === currentURL.origin) {
        return referrerURL;
      }
      return "no-referrer";
    case "origin-when-cross-origin":
      if (referrerURL.origin === currentURL.origin) {
        return referrerURL;
      }
      return referrerOrigin;
    case "no-referrer-when-downgrade":
      if (isUrlPotentiallyTrustworthy(referrerURL) && !isUrlPotentiallyTrustworthy(currentURL)) {
        return "no-referrer";
      }
      return referrerURL;
    default:
      throw new TypeError(`Invalid referrerPolicy: ${policy}`);
  }
}
function parseReferrerPolicyFromHeader(headers) {
  const policyTokens = (headers.get("referrer-policy") || "").split(/[,\s]+/);
  let policy = "";
  for (const token of policyTokens) {
    if (token && ReferrerPolicy.has(token)) {
      policy = token;
    }
  }
  return policy;
}
var import_node_net4, ReferrerPolicy, DEFAULT_REFERRER_POLICY;
var init_referrer = __esm({
  "node_modules/node-fetch/src/utils/referrer.js"() {
    import_node_net4 = require("node:net");
    ReferrerPolicy = /* @__PURE__ */ new Set([
      "",
      "no-referrer",
      "no-referrer-when-downgrade",
      "same-origin",
      "origin",
      "strict-origin",
      "origin-when-cross-origin",
      "strict-origin-when-cross-origin",
      "unsafe-url"
    ]);
    DEFAULT_REFERRER_POLICY = "strict-origin-when-cross-origin";
  }
});

// node_modules/node-fetch/src/request.js
var import_node_url, import_node_util3, INTERNALS3, isRequest, doBadDataWarn, Request, getNodeRequestOptions;
var init_request = __esm({
  "node_modules/node-fetch/src/request.js"() {
    import_node_url = require("node:url");
    import_node_util3 = require("node:util");
    init_headers();
    init_body();
    init_is();
    init_get_search();
    init_referrer();
    INTERNALS3 = /* @__PURE__ */ Symbol("Request internals");
    isRequest = (object) => {
      return typeof object === "object" && typeof object[INTERNALS3] === "object";
    };
    doBadDataWarn = (0, import_node_util3.deprecate)(
      () => {
      },
      ".data is not a valid RequestInit property, use .body instead",
      "https://github.com/node-fetch/node-fetch/issues/1000 (request)"
    );
    Request = class _Request extends Body {
      constructor(input, init = {}) {
        let parsedURL;
        if (isRequest(input)) {
          parsedURL = new URL(input.url);
        } else {
          parsedURL = new URL(input);
          input = {};
        }
        if (parsedURL.username !== "" || parsedURL.password !== "") {
          throw new TypeError(`${parsedURL} is an url with embedded credentials.`);
        }
        let method = init.method || input.method || "GET";
        if (/^(delete|get|head|options|post|put)$/i.test(method)) {
          method = method.toUpperCase();
        }
        if (!isRequest(init) && "data" in init) {
          doBadDataWarn();
        }
        if ((init.body != null || isRequest(input) && input.body !== null) && (method === "GET" || method === "HEAD")) {
          throw new TypeError("Request with GET/HEAD method cannot have body");
        }
        const inputBody = init.body ? init.body : isRequest(input) && input.body !== null ? clone(input) : null;
        super(inputBody, {
          size: init.size || input.size || 0
        });
        const headers = new Headers(init.headers || input.headers || {});
        if (inputBody !== null && !headers.has("Content-Type")) {
          const contentType = extractContentType(inputBody, this);
          if (contentType) {
            headers.set("Content-Type", contentType);
          }
        }
        let signal = isRequest(input) ? input.signal : null;
        if ("signal" in init) {
          signal = init.signal;
        }
        if (signal != null && !isAbortSignal(signal)) {
          throw new TypeError("Expected signal to be an instanceof AbortSignal or EventTarget");
        }
        let referrer = init.referrer == null ? input.referrer : init.referrer;
        if (referrer === "") {
          referrer = "no-referrer";
        } else if (referrer) {
          const parsedReferrer = new URL(referrer);
          referrer = /^about:(\/\/)?client$/.test(parsedReferrer) ? "client" : parsedReferrer;
        } else {
          referrer = void 0;
        }
        this[INTERNALS3] = {
          method,
          redirect: init.redirect || input.redirect || "follow",
          headers,
          parsedURL,
          signal,
          referrer
        };
        this.follow = init.follow === void 0 ? input.follow === void 0 ? 20 : input.follow : init.follow;
        this.compress = init.compress === void 0 ? input.compress === void 0 ? true : input.compress : init.compress;
        this.counter = init.counter || input.counter || 0;
        this.agent = init.agent || input.agent;
        this.highWaterMark = init.highWaterMark || input.highWaterMark || 16384;
        this.insecureHTTPParser = init.insecureHTTPParser || input.insecureHTTPParser || false;
        this.referrerPolicy = init.referrerPolicy || input.referrerPolicy || "";
      }
      /** @returns {string} */
      get method() {
        return this[INTERNALS3].method;
      }
      /** @returns {string} */
      get url() {
        return (0, import_node_url.format)(this[INTERNALS3].parsedURL);
      }
      /** @returns {Headers} */
      get headers() {
        return this[INTERNALS3].headers;
      }
      get redirect() {
        return this[INTERNALS3].redirect;
      }
      /** @returns {AbortSignal} */
      get signal() {
        return this[INTERNALS3].signal;
      }
      // https://fetch.spec.whatwg.org/#dom-request-referrer
      get referrer() {
        if (this[INTERNALS3].referrer === "no-referrer") {
          return "";
        }
        if (this[INTERNALS3].referrer === "client") {
          return "about:client";
        }
        if (this[INTERNALS3].referrer) {
          return this[INTERNALS3].referrer.toString();
        }
        return void 0;
      }
      get referrerPolicy() {
        return this[INTERNALS3].referrerPolicy;
      }
      set referrerPolicy(referrerPolicy) {
        this[INTERNALS3].referrerPolicy = validateReferrerPolicy(referrerPolicy);
      }
      /**
       * Clone this request
       *
       * @return  Request
       */
      clone() {
        return new _Request(this);
      }
      get [Symbol.toStringTag]() {
        return "Request";
      }
    };
    Object.defineProperties(Request.prototype, {
      method: { enumerable: true },
      url: { enumerable: true },
      headers: { enumerable: true },
      redirect: { enumerable: true },
      clone: { enumerable: true },
      signal: { enumerable: true },
      referrer: { enumerable: true },
      referrerPolicy: { enumerable: true }
    });
    getNodeRequestOptions = (request) => {
      const { parsedURL } = request[INTERNALS3];
      const headers = new Headers(request[INTERNALS3].headers);
      if (!headers.has("Accept")) {
        headers.set("Accept", "*/*");
      }
      let contentLengthValue = null;
      if (request.body === null && /^(post|put)$/i.test(request.method)) {
        contentLengthValue = "0";
      }
      if (request.body !== null) {
        const totalBytes = getTotalBytes(request);
        if (typeof totalBytes === "number" && !Number.isNaN(totalBytes)) {
          contentLengthValue = String(totalBytes);
        }
      }
      if (contentLengthValue) {
        headers.set("Content-Length", contentLengthValue);
      }
      if (request.referrerPolicy === "") {
        request.referrerPolicy = DEFAULT_REFERRER_POLICY;
      }
      if (request.referrer && request.referrer !== "no-referrer") {
        request[INTERNALS3].referrer = determineRequestsReferrer(request);
      } else {
        request[INTERNALS3].referrer = "no-referrer";
      }
      if (request[INTERNALS3].referrer instanceof URL) {
        headers.set("Referer", request.referrer);
      }
      if (!headers.has("User-Agent")) {
        headers.set("User-Agent", "node-fetch");
      }
      if (request.compress && !headers.has("Accept-Encoding")) {
        headers.set("Accept-Encoding", "gzip, deflate, br");
      }
      let { agent } = request;
      if (typeof agent === "function") {
        agent = agent(parsedURL);
      }
      const search = getSearch(parsedURL);
      const options = {
        // Overwrite search to retain trailing ? (issue #776)
        path: parsedURL.pathname + search,
        // The following options are not expressed in the URL
        method: request.method,
        headers: headers[/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")](),
        insecureHTTPParser: request.insecureHTTPParser,
        agent
      };
      return {
        /** @type {URL} */
        parsedURL,
        options
      };
    };
  }
});

// node_modules/node-fetch/src/errors/abort-error.js
var AbortError;
var init_abort_error = __esm({
  "node_modules/node-fetch/src/errors/abort-error.js"() {
    init_base();
    AbortError = class extends FetchBaseError {
      constructor(message, type = "aborted") {
        super(message, type);
      }
    };
  }
});

// node_modules/node-fetch/src/index.js
var src_exports = {};
__export(src_exports, {
  AbortError: () => AbortError,
  Blob: () => fetch_blob_default,
  FetchError: () => FetchError,
  File: () => file_default,
  FormData: () => FormData,
  Headers: () => Headers,
  Request: () => Request,
  Response: () => Response,
  blobFrom: () => blobFrom,
  blobFromSync: () => blobFromSync,
  default: () => fetch2,
  fileFrom: () => fileFrom,
  fileFromSync: () => fileFromSync,
  isRedirect: () => isRedirect
});
async function fetch2(url, options_) {
  return new Promise((resolve, reject) => {
    const request = new Request(url, options_);
    const { parsedURL, options } = getNodeRequestOptions(request);
    if (!supportedSchemas.has(parsedURL.protocol)) {
      throw new TypeError(`node-fetch cannot load ${url}. URL scheme "${parsedURL.protocol.replace(/:$/, "")}" is not supported.`);
    }
    if (parsedURL.protocol === "data:") {
      const data = dist_default(request.url);
      const response2 = new Response(data, { headers: { "Content-Type": data.typeFull } });
      resolve(response2);
      return;
    }
    const send = (parsedURL.protocol === "https:" ? import_node_https.default : import_node_http2.default).request;
    const { signal } = request;
    let response = null;
    const abort = () => {
      const error = new AbortError("The operation was aborted.");
      reject(error);
      if (request.body && request.body instanceof import_node_stream2.default.Readable) {
        request.body.destroy(error);
      }
      if (!response || !response.body) {
        return;
      }
      response.body.emit("error", error);
    };
    if (signal && signal.aborted) {
      abort();
      return;
    }
    const abortAndFinalize = () => {
      abort();
      finalize();
    };
    const request_ = send(parsedURL.toString(), options);
    if (signal) {
      signal.addEventListener("abort", abortAndFinalize);
    }
    const finalize = () => {
      request_.abort();
      if (signal) {
        signal.removeEventListener("abort", abortAndFinalize);
      }
    };
    request_.on("error", (error) => {
      reject(new FetchError(`request to ${request.url} failed, reason: ${error.message}`, "system", error));
      finalize();
    });
    fixResponseChunkedTransferBadEnding(request_, (error) => {
      if (response && response.body) {
        response.body.destroy(error);
      }
    });
    if (process.version < "v14") {
      request_.on("socket", (s2) => {
        let endedWithEventsCount;
        s2.prependListener("end", () => {
          endedWithEventsCount = s2._eventsCount;
        });
        s2.prependListener("close", (hadError) => {
          if (response && endedWithEventsCount < s2._eventsCount && !hadError) {
            const error = new Error("Premature close");
            error.code = "ERR_STREAM_PREMATURE_CLOSE";
            response.body.emit("error", error);
          }
        });
      });
    }
    request_.on("response", (response_) => {
      request_.setTimeout(0);
      const headers = fromRawHeaders(response_.rawHeaders);
      if (isRedirect(response_.statusCode)) {
        const location = headers.get("Location");
        let locationURL = null;
        try {
          locationURL = location === null ? null : new URL(location, request.url);
        } catch {
          if (request.redirect !== "manual") {
            reject(new FetchError(`uri requested responds with an invalid redirect URL: ${location}`, "invalid-redirect"));
            finalize();
            return;
          }
        }
        switch (request.redirect) {
          case "error":
            reject(new FetchError(`uri requested responds with a redirect, redirect mode is set to error: ${request.url}`, "no-redirect"));
            finalize();
            return;
          case "manual":
            break;
          case "follow": {
            if (locationURL === null) {
              break;
            }
            if (request.counter >= request.follow) {
              reject(new FetchError(`maximum redirect reached at: ${request.url}`, "max-redirect"));
              finalize();
              return;
            }
            const requestOptions = {
              headers: new Headers(request.headers),
              follow: request.follow,
              counter: request.counter + 1,
              agent: request.agent,
              compress: request.compress,
              method: request.method,
              body: clone(request),
              signal: request.signal,
              size: request.size,
              referrer: request.referrer,
              referrerPolicy: request.referrerPolicy
            };
            if (!isDomainOrSubdomain(request.url, locationURL) || !isSameProtocol(request.url, locationURL)) {
              for (const name of ["authorization", "www-authenticate", "cookie", "cookie2"]) {
                requestOptions.headers.delete(name);
              }
            }
            if (response_.statusCode !== 303 && request.body && options_.body instanceof import_node_stream2.default.Readable) {
              reject(new FetchError("Cannot follow redirect with body being a readable stream", "unsupported-redirect"));
              finalize();
              return;
            }
            if (response_.statusCode === 303 || (response_.statusCode === 301 || response_.statusCode === 302) && request.method === "POST") {
              requestOptions.method = "GET";
              requestOptions.body = void 0;
              requestOptions.headers.delete("content-length");
            }
            const responseReferrerPolicy = parseReferrerPolicyFromHeader(headers);
            if (responseReferrerPolicy) {
              requestOptions.referrerPolicy = responseReferrerPolicy;
            }
            resolve(fetch2(new Request(locationURL, requestOptions)));
            finalize();
            return;
          }
          default:
            return reject(new TypeError(`Redirect option '${request.redirect}' is not a valid value of RequestRedirect`));
        }
      }
      if (signal) {
        response_.once("end", () => {
          signal.removeEventListener("abort", abortAndFinalize);
        });
      }
      let body = (0, import_node_stream2.pipeline)(response_, new import_node_stream2.PassThrough(), (error) => {
        if (error) {
          reject(error);
        }
      });
      if (process.version < "v12.10") {
        response_.on("aborted", abortAndFinalize);
      }
      const responseOptions = {
        url: request.url,
        status: response_.statusCode,
        statusText: response_.statusMessage,
        headers,
        size: request.size,
        counter: request.counter,
        highWaterMark: request.highWaterMark
      };
      const codings = headers.get("Content-Encoding");
      if (!request.compress || request.method === "HEAD" || codings === null || response_.statusCode === 204 || response_.statusCode === 304) {
        response = new Response(body, responseOptions);
        resolve(response);
        return;
      }
      const zlibOptions = {
        flush: import_node_zlib.default.Z_SYNC_FLUSH,
        finishFlush: import_node_zlib.default.Z_SYNC_FLUSH
      };
      if (codings === "gzip" || codings === "x-gzip") {
        body = (0, import_node_stream2.pipeline)(body, import_node_zlib.default.createGunzip(zlibOptions), (error) => {
          if (error) {
            reject(error);
          }
        });
        response = new Response(body, responseOptions);
        resolve(response);
        return;
      }
      if (codings === "deflate" || codings === "x-deflate") {
        const raw = (0, import_node_stream2.pipeline)(response_, new import_node_stream2.PassThrough(), (error) => {
          if (error) {
            reject(error);
          }
        });
        raw.once("data", (chunk) => {
          if ((chunk[0] & 15) === 8) {
            body = (0, import_node_stream2.pipeline)(body, import_node_zlib.default.createInflate(), (error) => {
              if (error) {
                reject(error);
              }
            });
          } else {
            body = (0, import_node_stream2.pipeline)(body, import_node_zlib.default.createInflateRaw(), (error) => {
              if (error) {
                reject(error);
              }
            });
          }
          response = new Response(body, responseOptions);
          resolve(response);
        });
        raw.once("end", () => {
          if (!response) {
            response = new Response(body, responseOptions);
            resolve(response);
          }
        });
        return;
      }
      if (codings === "br") {
        body = (0, import_node_stream2.pipeline)(body, import_node_zlib.default.createBrotliDecompress(), (error) => {
          if (error) {
            reject(error);
          }
        });
        response = new Response(body, responseOptions);
        resolve(response);
        return;
      }
      response = new Response(body, responseOptions);
      resolve(response);
    });
    writeToStream(request_, request).catch(reject);
  });
}
function fixResponseChunkedTransferBadEnding(request, errorCallback) {
  const LAST_CHUNK = import_node_buffer3.Buffer.from("0\r\n\r\n");
  let isChunkedTransfer = false;
  let properLastChunkReceived = false;
  let previousChunk;
  request.on("response", (response) => {
    const { headers } = response;
    isChunkedTransfer = headers["transfer-encoding"] === "chunked" && !headers["content-length"];
  });
  request.on("socket", (socket) => {
    const onSocketClose = () => {
      if (isChunkedTransfer && !properLastChunkReceived) {
        const error = new Error("Premature close");
        error.code = "ERR_STREAM_PREMATURE_CLOSE";
        errorCallback(error);
      }
    };
    const onData = (buf) => {
      properLastChunkReceived = import_node_buffer3.Buffer.compare(buf.slice(-5), LAST_CHUNK) === 0;
      if (!properLastChunkReceived && previousChunk) {
        properLastChunkReceived = import_node_buffer3.Buffer.compare(previousChunk.slice(-3), LAST_CHUNK.slice(0, 3)) === 0 && import_node_buffer3.Buffer.compare(buf.slice(-2), LAST_CHUNK.slice(3)) === 0;
      }
      previousChunk = buf;
    };
    socket.prependListener("close", onSocketClose);
    socket.on("data", onData);
    request.on("close", () => {
      socket.removeListener("close", onSocketClose);
      socket.removeListener("data", onData);
    });
  });
}
var import_node_http2, import_node_https, import_node_zlib, import_node_stream2, import_node_buffer3, supportedSchemas;
var init_src = __esm({
  "node_modules/node-fetch/src/index.js"() {
    import_node_http2 = __toESM(require("node:http"), 1);
    import_node_https = __toESM(require("node:https"), 1);
    import_node_zlib = __toESM(require("node:zlib"), 1);
    import_node_stream2 = __toESM(require("node:stream"), 1);
    import_node_buffer3 = require("node:buffer");
    init_dist();
    init_body();
    init_response();
    init_headers();
    init_request();
    init_fetch_error();
    init_abort_error();
    init_is_redirect();
    init_esm_min();
    init_is();
    init_referrer();
    init_from();
    supportedSchemas = /* @__PURE__ */ new Set(["data:", "http:", "https:"]);
  }
});

// server.ts
var import_express = __toESM(require("express"), 1);
var import_crypto2 = __toESM(require("crypto"), 1);
var import_path2 = __toESM(require("path"), 1);
var import_fs2 = __toESM(require("fs"), 1);
var import_url = require("url");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_razorpay = __toESM(require("razorpay"), 1);
var import_nodemailer = __toESM(require("nodemailer"), 1);
var sesv2 = __toESM(require("@aws-sdk/client-sesv2"), 1);
var import_helmet = __toESM(require("helmet"), 1);

// node_modules/express-rate-limit/dist/index.mjs
var import_node_net = require("node:net");
var import_ip_address = __toESM(require_ip_address(), 1);
var import_node_net2 = require("node:net");
var import_node_buffer = require("node:buffer");
var import_node_crypto = require("node:crypto");
var import_node_net3 = require("node:net");
function ipKeyGenerator(ip, ipv6Subnet = 56) {
  if ((0, import_node_net.isIPv6)(ip)) {
    const address = new import_ip_address.Address6(ip);
    if (address.is4()) return address.to4().correctForm();
    if (ipv6Subnet) {
      const subnet = new import_ip_address.Address6(`${ip}/${ipv6Subnet}`);
      return subnet.networkForm();
    }
  }
  return ip;
}
var MemoryStore = class {
  constructor(validations2) {
    this.validations = validations2;
    this.previous = /* @__PURE__ */ new Map();
    this.current = /* @__PURE__ */ new Map();
    this.localKeys = true;
  }
  /**
   * Method that initializes the store.
   *
   * @param options {Options} - The options used to setup the middleware.
   */
  init(options) {
    this.windowMs = options.windowMs;
    this.validations?.windowMs(this.windowMs);
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => {
      this.clearExpired();
    }, this.windowMs);
    this.interval.unref?.();
  }
  /**
   * Method to fetch a client's hit count and reset time.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {ClientRateLimitInfo | undefined} - The number of hits and reset time for that client.
   *
   * @public
   */
  async get(key) {
    return this.current.get(key) ?? this.previous.get(key);
  }
  /**
   * Method to increment a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @returns {ClientRateLimitInfo} - The number of hits and reset time for that client.
   *
   * @public
   */
  async increment(key) {
    const client = this.getClient(key);
    const now = Date.now();
    if (client.resetTime.getTime() <= now) {
      this.resetClient(client, now);
    }
    client.totalHits++;
    return client;
  }
  /**
   * Method to decrement a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @public
   */
  async decrement(key) {
    const client = this.getClient(key);
    if (client.totalHits > 0) client.totalHits--;
  }
  /**
   * Method to reset a client's hit counter.
   *
   * @param key {string} - The identifier for a client.
   *
   * @public
   */
  async resetKey(key) {
    this.current.delete(key);
    this.previous.delete(key);
  }
  /**
   * Method to reset everyone's hit counter.
   *
   * @public
   */
  async resetAll() {
    this.current.clear();
    this.previous.clear();
  }
  /**
   * Method to stop the timer (if currently running) and prevent any memory
   * leaks.
   *
   * @public
   */
  shutdown() {
    clearInterval(this.interval);
    void this.resetAll();
  }
  /**
   * Recycles a client by setting its hit count to zero, and reset time to
   * `windowMs` milliseconds from now.
   *
   * NOT to be confused with `#resetKey()`, which removes a client from both the
   * `current` and `previous` maps.
   *
   * @param client {Client} - The client to recycle.
   * @param now {number} - The current time, to which the `windowMs` is added to get the `resetTime` for the client.
   *
   * @return {Client} - The modified client that was passed in, to allow for chaining.
   */
  resetClient(client, now = Date.now()) {
    client.totalHits = 0;
    client.resetTime.setTime(now + this.windowMs);
    return client;
  }
  /**
   * Retrieves or creates a client, given a key. Also ensures that the client being
   * returned is in the `current` map.
   *
   * @param key {string} - The key under which the client is (or is to be) stored.
   *
   * @returns {Client} - The requested client.
   */
  getClient(key) {
    if (this.current.has(key)) return this.current.get(key);
    let client;
    if (this.previous.has(key)) {
      client = this.previous.get(key);
      this.previous.delete(key);
    } else {
      client = { totalHits: 0, resetTime: /* @__PURE__ */ new Date() };
      this.resetClient(client);
    }
    this.current.set(key, client);
    return client;
  }
  /**
   * Move current clients to previous, create a new map for current.
   *
   * This function is called every `windowMs`.
   */
  clearExpired() {
    this.previous = this.current;
    this.current = /* @__PURE__ */ new Map();
  }
};
var ConsoleLogger = {
  warn(...args) {
    console.warn(...args.reverse());
  },
  error(...args) {
    console.error(...args.reverse());
  }
};
var SUPPORTED_DRAFT_VERSIONS = [
  "draft-6",
  "draft-7",
  "draft-8"
];
var getResetSeconds = (windowMs, resetTime) => {
  let resetSeconds;
  if (resetTime) {
    const deltaSeconds = Math.ceil((resetTime.getTime() - Date.now()) / 1e3);
    resetSeconds = Math.max(0, deltaSeconds);
  } else {
    resetSeconds = Math.ceil(windowMs / 1e3);
  }
  return resetSeconds;
};
var getPartitionKey = (key) => {
  const hash = (0, import_node_crypto.createHash)("sha256");
  hash.update(key);
  const partitionKey = hash.digest("hex").slice(0, 12);
  return import_node_buffer.Buffer.from(partitionKey).toString("base64");
};
var setLegacyHeaders = (response, info) => {
  if (response.headersSent) return;
  response.setHeader("X-RateLimit-Limit", info.limit.toString());
  response.setHeader("X-RateLimit-Remaining", info.remaining.toString());
  if (info.resetTime instanceof Date) {
    response.setHeader("Date", (/* @__PURE__ */ new Date()).toUTCString());
    response.setHeader(
      "X-RateLimit-Reset",
      Math.ceil(info.resetTime.getTime() / 1e3).toString()
    );
  }
};
var setDraft6Headers = (response, info, windowMs) => {
  if (response.headersSent) return;
  const windowSeconds = Math.ceil(windowMs / 1e3);
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  response.setHeader("RateLimit-Policy", `${info.limit};w=${windowSeconds}`);
  response.setHeader("RateLimit-Limit", info.limit.toString());
  response.setHeader("RateLimit-Remaining", info.remaining.toString());
  if (typeof resetSeconds === "number")
    response.setHeader("RateLimit-Reset", resetSeconds.toString());
};
var setDraft7Headers = (response, info, windowMs) => {
  if (response.headersSent) return;
  const windowSeconds = Math.ceil(windowMs / 1e3);
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  response.setHeader("RateLimit-Policy", `${info.limit};w=${windowSeconds}`);
  response.setHeader(
    "RateLimit",
    `limit=${info.limit}, remaining=${info.remaining}, reset=${resetSeconds}`
  );
};
var setDraft8Headers = (response, info, windowMs, name, key) => {
  if (response.headersSent) return;
  const windowSeconds = Math.ceil(windowMs / 1e3);
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  const partitionKey = getPartitionKey(key);
  const header = `r=${info.remaining}; t=${resetSeconds}`;
  const policy = `q=${info.limit}; w=${windowSeconds}; pk=:${partitionKey}:`;
  response.append("RateLimit", `"${name}"; ${header}`);
  response.append("RateLimit-Policy", `"${name}"; ${policy}`);
};
var setRetryAfterHeader = (response, info, windowMs) => {
  if (response.headersSent) return;
  const resetSeconds = getResetSeconds(windowMs, info.resetTime);
  response.setHeader("Retry-After", resetSeconds.toString());
};
var omitUndefinedProperties = (passedOptions) => {
  const omittedOptions = {};
  for (const k of Object.keys(passedOptions)) {
    const key = k;
    if (passedOptions[key] !== void 0) {
      omittedOptions[key] = passedOptions[key];
    }
  }
  return omittedOptions;
};
var ValidationError = class extends Error {
  /**
   * The code must be a string, in snake case and all capital, that starts with
   * the substring `ERR_ERL_`.
   *
   * The message must be a string, starting with an uppercase character,
   * describing the issue in detail.
   */
  constructor(code, message) {
    const url = `https://express-rate-limit.github.io/${code}/`;
    super(`${message} See ${url} for more information.`);
    this.name = this.constructor.name;
    this.code = code;
    this.help = url;
  }
};
var ChangeWarning = class extends ValidationError {
};
var usedStores = /* @__PURE__ */ new Set();
var singleCountKeys = /* @__PURE__ */ new WeakMap();
var validations = {
  enabled: {
    default: true
  },
  // Should be EnabledValidations type, but that's a circular reference
  disable() {
    for (const k of Object.keys(this.enabled)) this.enabled[k] = false;
  },
  /**
   * Checks whether the IP address is valid, and that it does not have a port
   * number in it.
   *
   * See https://github.com/express-rate-limit/express-rate-limit/wiki/Error-Codes#err_erl_invalid_ip_address.
   *
   * @param ip {string | undefined} - The IP address provided by Express as request.ip.
   *
   * @returns {void}
   */
  ip(ip) {
    if (ip === void 0) {
      throw new ValidationError(
        "ERR_ERL_UNDEFINED_IP_ADDRESS",
        `An undefined 'request.ip' was detected. This might indicate a misconfiguration or the connection being destroyed prematurely.`
      );
    }
    if (!(0, import_node_net3.isIP)(ip)) {
      throw new ValidationError(
        "ERR_ERL_INVALID_IP_ADDRESS",
        `An invalid 'request.ip' (${ip}) was detected. Consider passing a custom 'keyGenerator' function to the rate limiter.`
      );
    }
  },
  /**
   * Makes sure the trust proxy setting is not set to `true`.
   *
   * See https://github.com/express-rate-limit/express-rate-limit/wiki/Error-Codes#err_erl_permissive_trust_proxy.
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  trustProxy(request) {
    if (request.app.get("trust proxy") === true) {
      throw new ValidationError(
        "ERR_ERL_PERMISSIVE_TRUST_PROXY",
        `The Express 'trust proxy' setting is true, which allows anyone to trivially bypass IP-based rate limiting.`
      );
    }
  },
  /**
   * Makes sure the trust proxy setting is set in case the `X-Forwarded-For`
   * header is present.
   *
   * See https://github.com/express-rate-limit/express-rate-limit/wiki/Error-Codes#err_erl_unset_trust_proxy.
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  xForwardedForHeader(request) {
    if (request.headers["x-forwarded-for"] && request.app.get("trust proxy") === false) {
      throw new ValidationError(
        "ERR_ERL_UNEXPECTED_X_FORWARDED_FOR",
        `The 'X-Forwarded-For' header is set but the Express 'trust proxy' setting is false (default). This could indicate a misconfiguration which would prevent express-rate-limit from accurately identifying users.`
      );
    }
  },
  /**
   * Alert the user if the Forwarded header is set (standardized version of X-Forwarded-For - not supported by express as of version 5.1.0)
   *
   * @param request {Request} - The Express request object.
   *
   * @returns {void}
   */
  forwardedHeader(request) {
    if (request.headers.forwarded && request.ip === request.socket?.remoteAddress) {
      throw new ValidationError(
        "ERR_ERL_FORWARDED_HEADER",
        `The 'Forwarded' header (standardized X-Forwarded-For) is set but currently being ignored. Add a custom keyGenerator to use a value from this header.`
      );
    }
  },
  /**
   * Ensures totalHits value from store is a positive integer.
   *
   * @param hits {any} - The `totalHits` returned by the store.
   */
  positiveHits(hits) {
    if (typeof hits !== "number" || hits < 1 || hits !== Math.round(hits)) {
      throw new ValidationError(
        "ERR_ERL_INVALID_HITS",
        `The totalHits value returned from the store must be a positive integer, got ${hits}`
      );
    }
  },
  /**
   * Ensures a single store instance is not used with multiple express-rate-limit instances
   */
  unsharedStore(store) {
    if (usedStores.has(store)) {
      const maybeUniquePrefix = store?.localKeys ? "" : " (with a unique prefix)";
      throw new ValidationError(
        "ERR_ERL_STORE_REUSE",
        `A Store instance must not be shared across multiple rate limiters. Create a new instance of ${store.constructor.name}${maybeUniquePrefix} for each limiter instead.`
      );
    }
    usedStores.add(store);
  },
  /**
   * Ensures a given key is incremented only once per request.
   *
   * @param request {Request} - The Express request object.
   * @param store {Store} - The store class.
   * @param key {string} - The key used to store the client's hit count.
   *
   * @returns {void}
   */
  singleCount(request, store, key) {
    let storeKeys = singleCountKeys.get(request);
    if (!storeKeys) {
      storeKeys = /* @__PURE__ */ new Map();
      singleCountKeys.set(request, storeKeys);
    }
    const storeKey = store.localKeys ? store : store.constructor.name;
    let keys = storeKeys.get(storeKey);
    if (!keys) {
      keys = [];
      storeKeys.set(storeKey, keys);
    }
    const prefixedKey = `${store.prefix ?? ""}${key}`;
    if (keys.includes(prefixedKey)) {
      throw new ValidationError(
        "ERR_ERL_DOUBLE_COUNT",
        `The hit count for ${key} was incremented more than once for a single request.`
      );
    }
    keys.push(prefixedKey);
  },
  /**
   * Warns the user that the behaviour for `max: 0` / `limit: 0` is
   * changing in the next major release.
   *
   * @param limit {number} - The maximum number of hits per client.
   *
   * @returns {void}
   */
  limit(limit) {
    if (limit === 0) {
      throw new ChangeWarning(
        "WRN_ERL_MAX_ZERO",
        "Setting limit or max to 0 disables rate limiting in express-rate-limit v6 and older, but will cause all requests to be blocked in v7"
      );
    }
  },
  /**
   * Warns the user that the `draft_polli_ratelimit_headers` option is deprecated
   * and will be removed in the next major release.
   *
   * @param draft_polli_ratelimit_headers {any | undefined} - The now-deprecated setting that was used to enable standard headers.
   *
   * @returns {void}
   */
  draftPolliHeaders(draft_polli_ratelimit_headers) {
    if (draft_polli_ratelimit_headers) {
      throw new ChangeWarning(
        "WRN_ERL_DEPRECATED_DRAFT_POLLI_HEADERS",
        `The draft_polli_ratelimit_headers configuration option is deprecated and has been removed in express-rate-limit v7, please set standardHeaders: 'draft-6' instead.`
      );
    }
  },
  /**
   * Warns the user that the `onLimitReached` option is deprecated and
   * will be removed in the next major release.
   *
   * @param onLimitReached {any | undefined} - The maximum number of hits per client.
   *
   * @returns {void}
   */
  onLimitReached(onLimitReached) {
    if (onLimitReached) {
      throw new ChangeWarning(
        "WRN_ERL_DEPRECATED_ON_LIMIT_REACHED",
        "The onLimitReached configuration option is deprecated and has been removed in express-rate-limit v7."
      );
    }
  },
  /**
   * Warns the user when an invalid/unsupported version of the draft spec is passed.
   *
   * @param version {any | undefined} - The version passed by the user.
   *
   * @returns {void}
   */
  headersDraftVersion(version) {
    if (typeof version !== "string" || // @ts-expect-error This is fine. If version is not in the array, it will just return false.
    !SUPPORTED_DRAFT_VERSIONS.includes(version)) {
      const versionString = SUPPORTED_DRAFT_VERSIONS.join(", ");
      throw new ValidationError(
        "ERR_ERL_HEADERS_UNSUPPORTED_DRAFT_VERSION",
        `standardHeaders: only the following versions of the IETF draft specification are supported: ${versionString}.`
      );
    }
  },
  /**
   * Warns the user when the selected headers option requires a reset time but
   * the store does not provide one.
   *
   * @param resetTime {Date | undefined} - The timestamp when the client's hit count will be reset.
   *
   * @returns {void}
   */
  headersResetTime(resetTime) {
    if (!resetTime) {
      throw new ValidationError(
        "ERR_ERL_HEADERS_NO_RESET",
        `standardHeaders:  'draft-7' requires a 'resetTime', but the store did not provide one. The 'windowMs' value will be used instead, which may cause clients to wait longer than necessary.`
      );
    }
  },
  knownOptions(passedOptions) {
    if (!passedOptions) return;
    const optionsMap = {
      windowMs: true,
      limit: true,
      message: true,
      statusCode: true,
      legacyHeaders: true,
      standardHeaders: true,
      identifier: true,
      requestPropertyName: true,
      skipFailedRequests: true,
      skipSuccessfulRequests: true,
      keyGenerator: true,
      ipv6Subnet: true,
      handler: true,
      skip: true,
      requestWasSuccessful: true,
      store: true,
      validate: true,
      headers: true,
      max: true,
      passOnStoreError: true,
      logger: true
    };
    const validOptions = Object.keys(optionsMap).concat(
      "draft_polli_ratelimit_headers",
      // not a valid option anymore, but we have a more specific check for this one, so don't warn for it here
      // from express-slow-down - https://github.com/express-rate-limit/express-slow-down/blob/main/source/types.ts#L65
      "delayAfter",
      "delayMs",
      "maxDelayMs"
    );
    for (const key of Object.keys(passedOptions)) {
      if (!validOptions.includes(key)) {
        throw new ValidationError(
          "ERR_ERL_UNKNOWN_OPTION",
          `Unexpected configuration option: ${key}`
          // todo: suggest a valid option with a short levenstein distance?
        );
      }
    }
  },
  /**
   * Checks the options.validate setting to ensure that only recognized
   * validations are enabled or disabled.
   *
   * If any unrecognized values are found, an error is logged that
   * includes the list of supported validations.
   */
  validationsConfig() {
    const supportedValidations = Object.keys(this).filter(
      (k) => !["enabled", "disable"].includes(k)
    );
    supportedValidations.push("default");
    for (const key of Object.keys(this.enabled)) {
      if (!supportedValidations.includes(key)) {
        throw new ValidationError(
          "ERR_ERL_UNKNOWN_VALIDATION",
          `options.validate.${key} is not recognized. Supported validate options are: ${supportedValidations.join(
            ", "
          )}.`
        );
      }
    }
  },
  /**
   * Checks to see if the instance was created inside of a request handler,
   * which would prevent it from working correctly, with the default memory
   * store (or any other store with localKeys.)
   */
  creationStack(store) {
    const { stack } = new Error(
      "express-rate-limit validation check (set options.validate.creationStack=false to disable)"
    );
    if (stack?.includes("Layer.handle [as handle_request]") || // express v4
    stack?.includes("Layer.handleRequest")) {
      if (!store.localKeys) {
        throw new ValidationError(
          "ERR_ERL_CREATED_IN_REQUEST_HANDLER",
          "express-rate-limit instance should *usually* be created at app initialization, not when responding to a request."
        );
      }
      throw new ValidationError(
        "ERR_ERL_CREATED_IN_REQUEST_HANDLER",
        "express-rate-limit instance should be created at app initialization, not when responding to a request."
      );
    }
  },
  ipv6Subnet(ipv6Subnet) {
    if (ipv6Subnet === false) {
      return;
    }
    if (!Number.isInteger(ipv6Subnet) || ipv6Subnet < 32 || ipv6Subnet > 64) {
      throw new ValidationError(
        "ERR_ERL_IPV6_SUBNET",
        `Unexpected ipv6Subnet value: ${ipv6Subnet}. Expected an integer between 32 and 64 (usually 48-64).`
      );
    }
  },
  ipv6SubnetOrKeyGenerator(options) {
    if (options.ipv6Subnet !== void 0 && options.keyGenerator) {
      throw new ValidationError(
        "ERR_ERL_IPV6SUBNET_OR_KEYGENERATOR",
        `Incompatible options: the 'ipv6Subnet' option is ignored when a custom 'keyGenerator' function is also set.`
      );
    }
  },
  keyGeneratorIpFallback(keyGenerator) {
    if (!keyGenerator) {
      return;
    }
    const src = keyGenerator.toString();
    if ((src.includes("req.ip") || src.includes("request.ip")) && !src.includes("ipKeyGenerator")) {
      throw new ValidationError(
        "ERR_ERL_KEY_GEN_IPV6",
        "Custom keyGenerator appears to use request IP without calling the ipKeyGenerator helper function for IPv6 addresses. This could allow IPv6 users to bypass limits."
      );
    }
  },
  /**
   * Checks to see if the window duration is greater than 2^32 - 1. This is only
   * called by the default MemoryStore, since it uses Node's setInterval method.
   *
   * See https://nodejs.org/api/timers.html#setintervalcallback-delay-args.
   */
  windowMs(windowMs) {
    const SET_TIMEOUT_MAX = 2 ** 31 - 1;
    if (typeof windowMs !== "number" || Number.isNaN(windowMs) || windowMs < 1 || windowMs > SET_TIMEOUT_MAX) {
      throw new ValidationError(
        "ERR_ERL_WINDOW_MS",
        `Invalid windowMs value: ${windowMs}${typeof windowMs !== "number" ? ` (${typeof windowMs})` : ""}, must be a number between 1 and ${SET_TIMEOUT_MAX} when using the default MemoryStore`
      );
    }
  }
};
function validateLogger(logger) {
  if (typeof logger !== "object" || typeof logger.error !== "function" || typeof logger.warn !== "function") {
    throw new TypeError(
      "Provided logger does not implement the Logger interface"
    );
  }
}
var getValidations = (_enabled, logger) => {
  validateLogger(logger);
  let enabled;
  if (typeof _enabled === "boolean") {
    enabled = {
      default: _enabled
    };
  } else {
    enabled = {
      default: true,
      ..._enabled
    };
  }
  const wrappedValidations = { enabled };
  for (const [name, validation] of Object.entries(validations)) {
    if (typeof validation === "function")
      wrappedValidations[name] = (...args) => {
        if (!(enabled[name] ?? enabled.default)) {
          return;
        }
        try {
          ;
          validation.apply(
            wrappedValidations,
            args
          );
        } catch (error) {
          if (error instanceof ChangeWarning) logger.warn(error);
          else logger.error(error);
        }
      };
  }
  return wrappedValidations;
};
var isLegacyStore = (store) => (
  // Check that `incr` exists but `increment` does not - store authors might want
  // to keep both around for backwards compatibility.
  typeof store.incr === "function" && typeof store.increment !== "function"
);
var promisifyStore = (passedStore) => {
  if (!isLegacyStore(passedStore)) {
    return passedStore;
  }
  const legacyStore = passedStore;
  class PromisifiedStore {
    async increment(key) {
      return new Promise((resolve, reject) => {
        legacyStore.incr(
          key,
          (error, totalHits, resetTime) => {
            if (error) reject(error);
            resolve({ totalHits, resetTime });
          }
        );
      });
    }
    async decrement(key) {
      return legacyStore.decrement(key);
    }
    async resetKey(key) {
      return legacyStore.resetKey(key);
    }
    /* istanbul ignore next */
    async resetAll() {
      if (typeof legacyStore.resetAll === "function")
        return legacyStore.resetAll();
    }
  }
  return new PromisifiedStore();
};
var getOptionsFromConfig = (config) => {
  const { validations: validations2, ...directlyPassableEntries } = config;
  return {
    ...directlyPassableEntries,
    validate: validations2.enabled
  };
};
var parseOptions = (passedOptions) => {
  const notUndefinedOptions = omitUndefinedProperties(passedOptions);
  const logger = passedOptions.logger ?? ConsoleLogger;
  const validations2 = getValidations(
    notUndefinedOptions?.validate ?? true,
    logger
  );
  validations2.validationsConfig();
  validations2.knownOptions(passedOptions);
  validations2.draftPolliHeaders(
    // @ts-expect-error see the note above.
    notUndefinedOptions.draft_polli_ratelimit_headers
  );
  validations2.onLimitReached(notUndefinedOptions.onLimitReached);
  if (notUndefinedOptions.ipv6Subnet !== void 0 && typeof notUndefinedOptions.ipv6Subnet !== "function") {
    validations2.ipv6Subnet(notUndefinedOptions.ipv6Subnet);
  }
  validations2.keyGeneratorIpFallback(notUndefinedOptions.keyGenerator);
  validations2.ipv6SubnetOrKeyGenerator(notUndefinedOptions);
  let standardHeaders = notUndefinedOptions.standardHeaders ?? false;
  if (standardHeaders === true) standardHeaders = "draft-6";
  const config = {
    windowMs: 60 * 1e3,
    limit: passedOptions.max ?? 5,
    // `max` is deprecated, but support it anyways.
    message: "Too many requests, please try again later.",
    statusCode: 429,
    legacyHeaders: passedOptions.headers ?? true,
    identifier(request, _response) {
      let duration = "";
      const property = config.requestPropertyName;
      const { limit } = request[property];
      const seconds = config.windowMs / 1e3;
      const minutes = config.windowMs / (1e3 * 60);
      const hours = config.windowMs / (1e3 * 60 * 60);
      const days = config.windowMs / (1e3 * 60 * 60 * 24);
      if (seconds < 60) duration = `${seconds}sec`;
      else if (minutes < 60) duration = `${minutes}min`;
      else if (hours < 24) duration = `${hours}hr${hours > 1 ? "s" : ""}`;
      else duration = `${days}day${days > 1 ? "s" : ""}`;
      return `${limit}-in-${duration}`;
    },
    requestPropertyName: "rateLimit",
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    requestWasSuccessful: (_request, response) => response.statusCode < 400,
    skip: (_request, _response) => false,
    async keyGenerator(request, response) {
      validations2.ip(request.ip);
      validations2.trustProxy(request);
      validations2.xForwardedForHeader(request);
      validations2.forwardedHeader(request);
      const ip = request.ip;
      let subnet = 56;
      if ((0, import_node_net2.isIPv6)(ip)) {
        subnet = typeof config.ipv6Subnet === "function" ? await config.ipv6Subnet(request, response) : config.ipv6Subnet;
        if (typeof config.ipv6Subnet === "function")
          validations2.ipv6Subnet(subnet);
      }
      return ipKeyGenerator(ip, subnet);
    },
    ipv6Subnet: 56,
    async handler(request, response, _next, _optionsUsed) {
      response.status(config.statusCode);
      const message = typeof config.message === "function" ? await config.message(
        request,
        response
      ) : config.message;
      if (!response.writableEnded) response.send(message);
    },
    passOnStoreError: false,
    // Allow the default options to be overridden by the passed options.
    ...notUndefinedOptions,
    // `standardHeaders` is resolved into a draft version above, use that.
    standardHeaders,
    // Note that this field is declared after the user's options are spread in,
    // so that this field doesn't get overridden with an un-promisified store!
    store: promisifyStore(
      notUndefinedOptions.store ?? new MemoryStore(validations2)
    ),
    // Print an error to the console if a few known misconfigurations are detected.
    validations: validations2,
    logger
  };
  if (typeof config.store.increment !== "function" || typeof config.store.decrement !== "function" || typeof config.store.resetKey !== "function" || config.store.resetAll !== void 0 && typeof config.store.resetAll !== "function" || config.store.init !== void 0 && typeof config.store.init !== "function") {
    throw new TypeError(
      "An invalid store was passed. Please ensure that the store is a class that implements the `Store` interface."
    );
  }
  return config;
};
var handleAsyncErrors = (fn) => async (request, response, next) => {
  try {
    await Promise.resolve(fn(request, response, next)).catch(next);
  } catch (error) {
    next(error);
  }
};
var rateLimit = (passedOptions) => {
  const config = parseOptions(passedOptions ?? {});
  const options = getOptionsFromConfig(config);
  config.validations.creationStack(config.store);
  config.validations.unsharedStore(config.store);
  if (typeof config.store.init === "function") {
    try {
      const storeInit = config.store.init(options);
      if (storeInit instanceof Promise) {
        storeInit.catch(
          (error) => config.logger.error(
            error,
            "express-rate-limit: async error during store initialization."
          )
        );
      }
    } catch (error) {
      config.logger.error(
        error,
        "express-rate-limit: error during store initialization."
      );
    }
  }
  const middleware = handleAsyncErrors(
    async (request, response, next) => {
      const closePromise = config.skipFailedRequests && new Promise((resolve) => response.once("close", resolve));
      const finishPromise = (config.skipFailedRequests || config.skipSuccessfulRequests) && new Promise((resolve) => response.once("finish", resolve));
      const errorPromise = config.skipFailedRequests && new Promise((resolve) => response.once("error", resolve));
      const skip = await config.skip(request, response);
      if (skip) {
        next();
        return;
      }
      const augmentedRequest = request;
      const key = await config.keyGenerator(request, response);
      let totalHits = 0;
      let resetTime;
      try {
        const incrementResult = await config.store.increment(key);
        totalHits = incrementResult.totalHits;
        resetTime = incrementResult.resetTime;
      } catch (error) {
        if (config.passOnStoreError) {
          config.logger.error(
            error,
            "express-rate-limit: error from store, allowing request without rate-limiting."
          );
          next();
          return;
        }
        throw error;
      }
      config.validations.positiveHits(totalHits);
      config.validations.singleCount(request, config.store, key);
      const retrieveLimit = typeof config.limit === "function" ? config.limit(request, response) : config.limit;
      const limit = await retrieveLimit;
      config.validations.limit(limit);
      const info = {
        limit,
        used: totalHits,
        remaining: Math.max(limit - totalHits, 0),
        resetTime,
        key
      };
      Object.defineProperty(info, "current", {
        configurable: false,
        enumerable: false,
        value: totalHits
      });
      augmentedRequest[config.requestPropertyName] = info;
      if (config.legacyHeaders && !response.headersSent) {
        setLegacyHeaders(response, info);
      }
      if (config.standardHeaders && !response.headersSent) {
        switch (config.standardHeaders) {
          case "draft-6": {
            setDraft6Headers(response, info, config.windowMs);
            break;
          }
          case "draft-7": {
            config.validations.headersResetTime(info.resetTime);
            setDraft7Headers(response, info, config.windowMs);
            break;
          }
          case "draft-8": {
            const retrieveName = typeof config.identifier === "function" ? config.identifier(request, response) : config.identifier;
            const name = await retrieveName;
            config.validations.headersResetTime(info.resetTime);
            setDraft8Headers(response, info, config.windowMs, name, key);
            break;
          }
          default: {
            config.validations.headersDraftVersion(config.standardHeaders);
            break;
          }
        }
      }
      if (config.skipFailedRequests || config.skipSuccessfulRequests) {
        let decremented = false;
        const decrementKey = async () => {
          if (!decremented) {
            await config.store.decrement(key);
            decremented = true;
          }
        };
        if (config.skipFailedRequests) {
          if (finishPromise) {
            void finishPromise.then(async () => {
              if (!await config.requestWasSuccessful(request, response))
                await decrementKey();
            });
          }
          if (closePromise) {
            void closePromise.then(async () => {
              if (!response.writableEnded) await decrementKey();
            });
          }
          if (errorPromise) {
            void errorPromise.then(async () => {
              await decrementKey();
            });
          }
        }
        if (config.skipSuccessfulRequests) {
          if (finishPromise) {
            void finishPromise.then(async () => {
              if (await config.requestWasSuccessful(request, response))
                await decrementKey();
            });
          }
        }
      }
      config.validations.disable();
      if (totalHits > limit) {
        if (config.legacyHeaders || config.standardHeaders) {
          setRetryAfterHeader(response, info, config.windowMs);
        }
        config.handler(request, response, next, options);
        return;
      }
      next();
    }
  );
  const getThrowFn = () => {
    throw new Error("The current store does not support the get/getKey method");
  };
  middleware.resetKey = config.store.resetKey.bind(config.store);
  middleware.getKey = typeof config.store.get === "function" ? config.store.get.bind(config.store) : getThrowFn;
  return middleware;
};
var rate_limit_default = rateLimit;

// server.ts
var import_compression = __toESM(require("compression"), 1);
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
var import_jsonwebtoken = __toESM(require("jsonwebtoken"), 1);
var import_node_cron = __toESM(require("node-cron"), 1);
var import_client2 = require("@prisma/client");

// src/routes/extraction.ts
var import_client = require("@prisma/client");

// src/lib/dedup.ts
var import_crypto = __toESM(require("crypto"), 1);
function generateFingerprint(title, authors) {
  const normalizedTitle = (title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
  const normalizedAuthors = (authors || "").toLowerCase().replace(/[^a-z0-9\s,]/g, "").split(",").map((a) => a.trim()).sort().join(",");
  return import_crypto.default.createHash("sha256").update(`${normalizedTitle}::${normalizedAuthors}`).digest("hex");
}

// src/routes/extraction.ts
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_child_process = require("child_process");

// src/lib/aiAgent.ts
async function evaluateArticlesWithAI(domain, articles) {
  const apiKey = process.env.OPENROUTER_API_KEY || "";
  const model = "nvidia/nemotron-3-super-120b-a12b:free";
  if (articles.length === 0) return [];
  const promptData = articles.map((a, idx) => ({
    id: idx,
    title: a.title,
    abstract: a.abstract ? a.abstract.substring(0, 300) + "..." : "No abstract"
  }));
  const systemPrompt = `You are an expert academic librarian and data curator.
Your task is to filter a list of articles and return ONLY the ones that are strictly relevant to the domain: "${domain}".
The articles must be high-quality, academic, and contextually appropriate.
Ignore articles that are completely off-topic or generic low-quality entries.
Return a valid JSON array containing ONLY the IDs of the approved articles. Example: [0, 2, 5]. Do not return any other text.`;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(promptData) }
        ],
        response_format: { type: "json_object" }
      })
    });
    if (!res.ok) {
      console.error("OpenRouter API Error:", await res.text());
      return articles;
    }
    const data = await res.json();
    const content = data.choices[0]?.message?.content || "[]";
    let approvedIds = [];
    const match = content.match(/\[([\d,\s]*)\]/);
    if (match) {
      approvedIds = match[1].split(",").map((s2) => parseInt(s2.trim(), 10)).filter((n) => !isNaN(n));
    }
    const filtered = articles.filter((_, idx) => approvedIds.includes(idx));
    console.log(`AI Agent filtered ${articles.length} down to ${filtered.length} high-quality articles.`);
    return filtered.length > 0 ? filtered : articles.slice(0, 2);
  } catch (err) {
    console.error("AI Evaluation failed:", err);
    return articles;
  }
}

// src/routes/extraction.ts
var prisma = new import_client.PrismaClient();
function setupExtractionRoutes(app, authenticateJWT, requireSuperAdmin) {
  app.post("/api/admin/extraction/jobs", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { name, sourceType, sourceConfig, targetDomain, targetContentType } = req.body;
      const job = await prisma.extractionJob.create({
        data: {
          name,
          sourceType,
          sourceConfig,
          targetDomain,
          targetContentType,
          status: "Pending"
        }
      });
      res.json(job);
    } catch (error) {
      console.error("Create job error:", error);
      res.status(500).json({ error: "Failed to create extraction job" });
    }
  });
  app.get("/api/admin/extraction/jobs", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const jobs = await prisma.extractionJob.findMany({
        orderBy: { createdAt: "desc" }
      });
      res.json(jobs);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });
  app.get("/api/admin/extraction/jobs/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const job = await prisma.extractionJob.findUnique({
        where: { id: req.params.id },
        include: {
          items: {
            take: 100,
            // Just return first 100 for now to avoid huge payloads
            orderBy: { createdAt: "desc" }
          }
        }
      });
      if (!job) return res.status(404).json({ error: "Job not found" });
      res.json(job);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch job" });
    }
  });
  app.post("/api/admin/extraction/jobs/:id/start", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const jobId = req.params.id;
      const job = await prisma.extractionJob.findUnique({ where: { id: jobId } });
      if (!job) return res.status(404).json({ error: "Job not found" });
      await prisma.extractionJob.update({
        where: { id: jobId },
        data: { status: "Running", startedAt: /* @__PURE__ */ new Date() }
      });
      if (job.sourceType === "AutomatedMassScraper") {
        runMassExtraction(job).catch(console.error);
        return res.json({ success: true, message: `Extraction started for ${job.targetDomain}.` });
      } else if (job.sourceType === "OJS") {
        runOjsExtraction(job).catch(console.error);
        return res.json({ success: true, message: `OJS Extraction started for ${job.targetDomain}.` });
      }
      res.json({ success: false, message: "Unknown source type" });
    } catch (error) {
      res.status(500).json({ error: "Failed to start job" });
    }
  });
}
async function runMassExtraction(job) {
  let processed = 0;
  let duplicates = 0;
  let flagged = 0;
  let failed = 0;
  let totalInserted = 0;
  const query = `${job.targetDomain} ${job.targetContentType}`.trim();
  try {
    let allFetchedArticles = [];
    for (let page = 1; page <= 3; page++) {
      const fetchRes = await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&filter=has_pdf_url:true&per-page=50&page=${page}`);
      const data = await fetchRes.json();
      if (data && data.results && data.results.length > 0) {
        allFetchedArticles = allFetchedArticles.concat(data.results);
      } else {
        break;
      }
    }
    console.log(`OpenAlex found ${allFetchedArticles.length} OA articles for ${query}.`);
    const BATCH_SIZE = 50;
    for (let i2 = 0; i2 < allFetchedArticles.length; i2 += BATCH_SIZE) {
      const batch = allFetchedArticles.slice(i2, i2 + BATCH_SIZE);
      const articlesFormat = batch.map((a) => ({
        _raw: a,
        title: a.title || "Untitled",
        abstract: a.concepts ? "Keywords: " + a.concepts.map((c) => c.display_name).join(", ") : "No abstract",
        authors: a.authorships?.map((au) => au.author?.display_name).join(", ") || "Unknown",
        pdfUrl: a.best_oa_location?.pdf_url || a.open_access?.oa_url,
        keywords: a.concepts?.map((c) => c.display_name) || []
      })).filter((a) => a.pdfUrl);
      if (articlesFormat.length === 0) continue;
      console.log(`Sending ${articlesFormat.length} items to AI Engine for curation...`);
      const curatedArticles = await evaluateArticlesWithAI(job.targetDomain, articlesFormat);
      console.log(`AI Engine approved ${curatedArticles.length} items.`);
      for (const result of curatedArticles) {
        try {
          if (!result.pdfUrl) {
            failed++;
            processed++;
            continue;
          }
          const fingerprint = generateFingerprint(result.title, result.authors);
          const item = await prisma.extractionItem.create({
            data: {
              jobId: job.id,
              rawData: result._raw,
              status: "Pending"
            }
          });
          const existing = await prisma.content.findUnique({ where: { fingerprint } });
          if (existing) {
            await prisma.extractionItem.update({
              where: { id: item.id },
              data: { fingerprint, status: "Duplicate" }
            });
            duplicates++;
            processed++;
            continue;
          }
          const newContent = await prisma.content.create({
            data: {
              title: result.title,
              authors: result.authors,
              description: `Auto-extracted OA content from OpenAlex.`,
              domain: job.targetDomain,
              contentType: job.targetContentType,
              subjectArea: result.keywords[0] || job.targetDomain,
              fileUrl: result.pdfUrl,
              tags: result.keywords.slice(0, 5),
              price: 0,
              accessType: "OpenAccess",
              status: "Published",
              publishingMode: "Auto-Extracted",
              fingerprint
            }
          });
          await prisma.extractionItem.update({
            where: { id: item.id },
            data: {
              fingerprint,
              title: result.title,
              authors: result.authors,
              domain: job.targetDomain,
              contentType: job.targetContentType,
              fileUrl: result.pdfUrl,
              contentId: newContent.id,
              status: "Inserted"
            }
          });
          totalInserted++;
          processed++;
        } catch (e2) {
          console.error("Error inserting item:", e2);
          failed++;
          processed++;
        }
      }
      await prisma.extractionJob.update({
        where: { id: job.id },
        data: { totalProcessed: processed, totalDuplicates: duplicates, totalFailed: failed, totalInserted }
      });
    }
  } catch (err) {
    console.error("Mass Extraction Error:", err);
    failed++;
  }
  await prisma.extractionJob.update({
    where: { id: job.id },
    data: {
      status: "Completed",
      completedAt: /* @__PURE__ */ new Date(),
      totalProcessed: processed,
      totalDuplicates: duplicates,
      totalFailed: failed,
      totalInserted
    }
  });
}
async function runOjsExtraction(job) {
  let processed = 0;
  let duplicates = 0;
  let flagged = 0;
  let failed = 0;
  try {
    let baseUrl = job.sourceConfig?.ojsUrl || "https://engineeringjournals.stmjournals.in";
    baseUrl = baseUrl.replace(/\/$/, "");
    const cookieFile = import_path.default.join(process.cwd(), `ojs-cookies-${Date.now()}.txt`);
    try {
      (0, import_child_process.execSync)(`curl -s -c ${cookieFile} ${baseUrl}/index.php/index/login > /dev/null`);
      (0, import_child_process.execSync)(`curl -s -b ${cookieFile} -c ${cookieFile} -d 'username=enggstm&password=EEEcal@STM%231&source=' -L ${baseUrl}/index.php/index/login/signIn > /dev/null`);
      console.log("OJS Login Attempted via curl.");
    } catch (e2) {
      console.error("OJS Login Error via curl:", e2);
    }
    const pdfDir = import_path.default.join(process.cwd(), "public", "extracted_pdfs");
    if (!import_fs.default.existsSync(pdfDir)) {
      import_fs.default.mkdirSync(pdfDir, { recursive: true });
    }
    const oaiUrl = `${baseUrl}/index.php/index/oai?verb=ListRecords&metadataPrefix=oai_dc`;
    const fetchRes = await fetch(oaiUrl);
    const text = await fetchRes.text();
    const records = text.match(/<record>[\s\S]*?<\/record>/g) || [];
    const maxRecords = Math.min(records.length, 100);
    for (let i2 = 0; i2 < maxRecords; i2++) {
      const recordXml = records[i2];
      if (recordXml.includes('status="deleted"')) continue;
      try {
        const titleMatch = recordXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
        const title = titleMatch ? titleMatch[1].trim() : "Untitled";
        const creators = [...recordXml.matchAll(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/g)].map((m2) => m2[1].trim());
        const authors = creators.length > 0 ? creators.join(", ") : "Unknown";
        const descMatch = recordXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/);
        const description = descMatch ? descMatch[1].trim() : `OJS Extracted Content from ${baseUrl}`;
        const relationMatch = recordXml.match(/<dc:relation[^>]*>(https?:\/\/[^\s<]+?pdf[^\s<]*)<\/dc:relation>/i);
        let ojsPdfUrl = relationMatch ? relationMatch[1] : null;
        if (!ojsPdfUrl) {
          const idMatch = recordXml.match(/<dc:identifier[^>]*>(https?:\/\/[^\s<]+?pdf[^\s<]*)<\/dc:identifier>/i);
          if (idMatch) ojsPdfUrl = idMatch[1];
        }
        if (!ojsPdfUrl) {
          const viewMatch = recordXml.match(/<dc:identifier[^>]*>(https?:\/\/[^\s<]+\/article\/view\/\d+)<\/dc:identifier>/i);
          if (viewMatch) {
            ojsPdfUrl = `${viewMatch[1]}/pdf`;
          } else {
            failed++;
            processed++;
            continue;
          }
        }
        if (ojsPdfUrl.includes("/article/view/")) {
          ojsPdfUrl = ojsPdfUrl.replace("/article/view/", "/article/download/");
        }
        const fingerprint = generateFingerprint(title, authors);
        const item = await prisma.extractionItem.create({
          data: {
            jobId: job.id,
            rawData: { title, authors, sourceUrl: ojsPdfUrl, source: baseUrl },
            status: "Pending"
          }
        });
        const existing = await prisma.content.findUnique({ where: { fingerprint } });
        if (existing) {
          await prisma.extractionItem.update({
            where: { id: item.id },
            data: { fingerprint, status: "Duplicate" }
          });
          duplicates++;
          processed++;
          continue;
        }
        let localFileUrl = ojsPdfUrl;
        try {
          const filename = `ojs_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
          const filePath = import_path.default.join(pdfDir, filename);
          const headersStr = (0, import_child_process.execSync)(`curl -s -I -b ${cookieFile} -L ${ojsPdfUrl}`).toString();
          if (headersStr.toLowerCase().includes("application/pdf")) {
            (0, import_child_process.execSync)(`curl -s -b ${cookieFile} -L ${ojsPdfUrl} -o ${filePath}`);
            localFileUrl = `/extracted_pdfs/${filename}`;
          } else {
            console.log(`Warning: Downloaded content is not PDF for ${ojsPdfUrl}`);
            await prisma.extractionItem.update({
              where: { id: item.id },
              data: { fingerprint, status: "Failed", errorMessage: "Paywalled or login failed" }
            });
            failed++;
            processed++;
            continue;
          }
        } catch (downloadErr) {
          console.error("Download Error:", downloadErr);
          localFileUrl = ojsPdfUrl;
        }
        const newContent = await prisma.content.create({
          data: {
            title,
            authors,
            description,
            domain: job.targetDomain,
            contentType: job.targetContentType,
            subjectArea: job.targetDomain,
            fileUrl: localFileUrl,
            tags: [],
            price: 0,
            accessType: "OpenAccess",
            status: "Published",
            publishingMode: "Auto-Extracted",
            fingerprint
          }
        });
        await prisma.extractionItem.update({
          where: { id: item.id },
          data: {
            fingerprint,
            title,
            authors,
            domain: job.targetDomain,
            contentType: job.targetContentType,
            fileUrl: localFileUrl,
            contentId: newContent.id,
            status: "Inserted"
          }
        });
        processed++;
        if (processed % 10 === 0) {
          await prisma.extractionJob.update({
            where: { id: job.id },
            data: { totalProcessed: processed, totalDuplicates: duplicates, totalFailed: failed, totalInserted: processed - duplicates - failed }
          });
        }
      } catch (e2) {
        failed++;
        processed++;
      }
    }
  } catch (err) {
    console.error("OJS Extraction Error:", err);
    failed++;
  }
  await prisma.extractionJob.update({
    where: { id: job.id },
    data: {
      status: "Completed",
      completedAt: /* @__PURE__ */ new Date(),
      totalProcessed: processed,
      totalDuplicates: duplicates,
      totalFailed: failed,
      totalInserted: processed - duplicates - failed
    }
  });
}

// server.ts
var import_meta = {};
if (!import_crypto2.default.hash) {
  import_crypto2.default.hash = function(algo, data, encoding) {
    return import_crypto2.default.createHash(algo).update(data).digest(encoding);
  };
}
var prisma2 = new import_client2.PrismaClient();
var APP_DIR = typeof __dirname !== "undefined" ? __dirname : import_path2.default.dirname((0, import_url.fileURLToPath)(import_meta.url));
var SETTINGS_FILE = import_path2.default.join(APP_DIR, "settings.json");
function getSystemSettings() {
  if (import_fs2.default.existsSync(SETTINGS_FILE)) {
    try {
      return JSON.parse(import_fs2.default.readFileSync(SETTINGS_FILE, "utf8"));
    } catch {
      return { emailVerificationEnabled: true };
    }
  }
  return { emailVerificationEnabled: true };
}
function setSystemSettings(settings) {
  import_fs2.default.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
import_dotenv.default.config();
var currentDir = process.cwd();
async function startServer() {
  const app = (0, import_express.default)();
  app.set("trust proxy", 1);
  const PORT = Number(process.env.PORT) || 3e3;
  app.use((0, import_helmet.default)({
    contentSecurityPolicy: false
    // Disable CSP if it interferes with Vite/External resources, or configure properly
  }));
  app.use((0, import_compression.default)());
  const apiLimiter = rate_limit_default({
    windowMs: 15 * 60 * 1e3,
    // 15 minutes
    max: 1e3,
    // 1000 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests from this IP, please try again after 15 minutes" }
  });
  const loginLimiter = rate_limit_default({
    windowMs: 15 * 60 * 1e3,
    // 15 minutes
    max: 15,
    // Max 15 login attempts per 15 minutes
    message: { error: "Too many login attempts from this IP, please try again after 15 minutes" }
  });
  app.use("/api/", apiLimiter);
  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth/admin-login", loginLimiter);
  app.use(import_express.default.json({ limit: "50mb" }));
  app.use(import_express.default.urlencoded({ limit: "50mb", extended: true }));
  const JWT_SECRET = process.env.JWT_SECRET || "your-fallback-secret-for-dev-only";
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("CRITICAL SECURITY ERROR: JWT_SECRET must be set in production environment variables.");
  }
  const authenticateJWT = (req, res, next) => {
    let token = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      token = authHeader.split(" ")[1];
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }
    if (token) {
      import_jsonwebtoken.default.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
          return res.status(403).json({ error: "Forbidden: Invalid or expired token" });
        }
        req.user = user;
        next();
      });
    } else {
      res.status(401).json({ error: "Unauthorized: No token provided" });
    }
  };
  const getRazorpay = () => {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables.");
    }
    return new import_razorpay.default({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
  };
  const ses = new sesv2.SESv2Client({
    region: (process.env.AWS_REGION || "ap-south-1").trim(),
    credentials: {
      accessKeyId: (process.env.AWS_ACCESS_KEY_ID || "").trim(),
      secretAccessKey: (process.env.AWS_SECRET_ACCESS_KEY || "").trim()
    }
  });
  const isDevMode = !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || process.env.NODE_ENV === "development";
  let transporter;
  let etherealUser = "";
  let etherealPass = "";
  if (isDevMode) {
    const testAccount = await import_nodemailer.default.createTestAccount();
    etherealUser = testAccount.user;
    etherealPass = testAccount.pass;
    transporter = import_nodemailer.default.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: etherealUser, pass: etherealPass }
    });
    console.log("\n\u{1F9EA} ===== LOCAL DEV MODE: Using Ethereal Email =====");
    console.log(`   \u{1F4E7} Ethereal Inbox: https://ethereal.email/messages`);
    console.log(`   \u{1F464} User: ${etherealUser}`);
    console.log(`   \u{1F511} Pass: ${etherealPass}`);
    console.log("   \u2139\uFE0F  Every email sent will print a preview URL in this console.");
    console.log("=================================================\n");
  } else {
    transporter = import_nodemailer.default.createTransport({
      SES: { sesClient: ses, SendEmailCommand: sesv2.SendEmailCommand }
    });
    transporter.verify((error) => {
      if (error) {
        console.error("\u274C Email Transporter Verification Failed:", error);
      } else {
        console.log("\u2705 Email Transporter is ready (SES v2)");
      }
    });
  }
  const _logoPath = import_path2.default.join(process.cwd(), "public", "assets", "stm-logo-email.png");
  const _logoCidAttachment = import_fs2.default.existsSync(_logoPath) ? {
    filename: "stm-logo-email.png",
    path: _logoPath,
    cid: "stm-logo-email"
  } : null;
  const createDynamicTransporter = () => {
    const settings = getSystemSettings();
    const accessKey = settings.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID;
    const secretKey = settings.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
    const region = settings.awsRegion || process.env.AWS_REGION || "us-west-2";
    if (!accessKey || !secretKey) {
      return { transporter: null, isDev: true };
    }
    const dynamicSes = new sesv2.SESv2Client({
      region: region.trim(),
      credentials: { accessKeyId: accessKey.trim(), secretAccessKey: secretKey.trim() }
    });
    const dynamicTransporter = import_nodemailer.default.createTransport({
      SES: { sesClient: dynamicSes, SendEmailCommand: sesv2.SendEmailCommand }
    });
    return { transporter: dynamicTransporter, isDev: false, emailFrom: settings.emailFrom || process.env.EMAIL_FROM || "info@celnet.in" };
  };
  const sendMail = async (mailOptions, logAsSent = true) => {
    try {
      const { transporter: dynTrans, isDev, emailFrom } = createDynamicTransporter();
      const opts = { ...mailOptions };
      if (opts.from && typeof opts.from === "string") {
        if (opts.from.includes("<") && opts.from.includes(">")) {
          const namePart = opts.from.split("<")[0];
          opts.from = `${namePart}<${emailFrom}>`;
        } else {
          opts.from = emailFrom;
        }
      } else {
        opts.from = `"STM Digital Library" <${emailFrom}>`;
      }
      if (_logoCidAttachment && opts.html && typeof opts.html === "string" && opts.html.includes("cid:stm-logo-email")) {
        opts.attachments = [...opts.attachments || [], _logoCidAttachment];
      }
      let info;
      if (isDev) {
        info = await transporter.sendMail(opts);
        const previewUrl = import_nodemailer.default.getTestMessageUrl(info);
        console.log("\n\u{1F4E8} ===== EMAIL SENT (DEV PREVIEW) =====");
        console.log(`   To: ${opts.to}`);
        console.log(`   Subject: ${opts.subject}`);
        console.log(`   \u{1F517} Preview URL: ${previewUrl}`);
        console.log("=======================================\n");
      } else {
        info = await dynTrans.sendMail(opts);
      }
      if (logAsSent) {
        await prisma2.emailLog.create({
          data: {
            to: typeof opts.to === "string" ? opts.to : JSON.stringify(opts.to),
            subject: opts.subject,
            status: "Sent",
            htmlContent: opts.html || null
          }
        }).catch((e2) => console.error("Failed to log email success", e2));
      }
      return info;
    } catch (error) {
      console.error("\u274C Email Sending Failed:", error);
      if (logAsSent) {
        await prisma2.emailLog.create({
          data: {
            to: typeof mailOptions.to === "string" ? mailOptions.to : JSON.stringify(mailOptions.to),
            subject: mailOptions.subject || "No Subject",
            status: "Failed",
            error: error?.message || String(error),
            htmlContent: mailOptions.html || null
          }
        }).catch((e2) => console.error("Failed to log email error", e2));
      }
      if (mailOptions._isTestEmail) {
        throw error;
      }
      return null;
    }
  };
  const buildEmail = (bodyRows) => `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);"><tr><td style="border-top:4px solid #1e3a6e;padding:28px 40px 20px;text-align:center;"><img src="cid:stm-logo-email" alt="STM Digital Library" width="80" height="80" style="border-radius:50%;display:block;margin:0 auto 14px;border:3px solid #e2e8f0;"/><h2 style="margin:0 0 6px;font-size:20px;font-weight:800;color:#1e3a6e;">STM Digital Library</h2><p style="margin:0;font-size:12px;color:#64748b;">A Division of Consortium eLearning Network Pvt. Ltd.</p><div style="margin-top:16px;border-top:1px solid #f1f5f9;"></div></td></tr>` + bodyRows + `<tr><td style="background:#1e3a6e;padding:24px 40px;text-align:center;"><p style="margin:0 0 12px;font-size:11px;color:#f59e0b;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">\u{1F3C6} 21 Years of Trusted Excellence in Education &amp; Academic Publishing</p><p style="margin:0 0 2px;font-size:13px;color:#cbd5e1;">Regards,</p><p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#ffffff;">STM Digital Library Team</p><p style="margin:0 0 16px;font-size:12px;color:#94a3b8;">A Division of Consortium eLearning Network Pvt. Ltd.</p><div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:14px;"><p style="margin:0;font-size:11px;color:#64748b;">\xA9 2026 STM Digital Library. All rights reserved.&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" style="color:#93c5fd;text-decoration:none;">Privacy Policy</a>&nbsp;&nbsp;|&nbsp;&nbsp;<a href="#" style="color:#93c5fd;text-decoration:none;">Terms &amp; Conditions</a></p></div></td></tr><tr><td style="height:4px;background:linear-gradient(90deg,#1e3a6e,#2563eb,#1e3a6e);"></td></tr></table></td></tr></table></body></html>`;
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });
  app.get("/api/public/counts", async (req, res) => {
    try {
      const [books, periodicals, theses, videos, totalContent] = await Promise.all([
        prisma2.content.count({ where: { contentType: "Books", status: { not: "Draft" } } }),
        prisma2.content.count({ where: { contentType: "Periodicals", status: { not: "Draft" } } }),
        prisma2.content.count({ where: { contentType: "Theses", status: { not: "Draft" } } }),
        prisma2.content.count({ where: { contentType: "Educational Videos", status: { not: "Draft" } } }),
        prisma2.content.count({ where: { status: { not: "Draft" } } })
      ]);
      res.json({
        categories: [
          { label: "Books", value: `${books}+` },
          { label: "Periodicals", value: `${periodicals}+` },
          { label: "Theses", value: `${theses}+` },
          { label: "Educational Videos", value: `${videos}+` }
        ],
        totalContent
      });
    } catch (error) {
      console.error("Public counts error:", error);
      res.status(500).json({ error: "Failed to fetch counts" });
    }
  });
  app.get("/api/public/content-type-counts", async (req, res) => {
    try {
      const groups = await prisma2.content.groupBy({
        by: ["contentType"],
        where: { status: { not: "Draft" } },
        _count: { id: true }
      });
      const countsMap = groups.reduce((acc, g) => {
        if (g.contentType) acc[g.contentType] = g._count.id;
        return acc;
      }, {});
      res.json(countsMap);
    } catch (error) {
      console.error("Content type counts error:", error);
      res.status(500).json({ error: "Failed to fetch content type counts" });
    }
  });
  app.get("/api/public/domain-counts", async (req, res) => {
    try {
      const groups = await prisma2.content.groupBy({
        by: ["domain"],
        where: { status: { not: "Draft" }, domain: { not: null } },
        _count: { id: true }
      });
      const countsMap = groups.reduce((acc, g) => {
        if (g.domain) acc[g.domain] = g._count.id;
        return acc;
      }, {});
      res.json(countsMap);
    } catch (error) {
      console.error("Domain counts error:", error);
      res.status(500).json({ error: "Failed to fetch domain counts" });
    }
  });
  app.get("/api/public/settings", (req, res) => {
    const settings = getSystemSettings();
    res.json({
      emailVerificationEnabled: settings.emailVerificationEnabled,
      publisherSafeMode: Boolean(settings.publisherSafeMode),
      hidePricing: Boolean(settings.hidePricing)
      // hide all commercial UI on the public site
    });
  });
  app.post("/api/verify/check-or-send", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const settings = getSystemSettings();
      if (!settings.emailVerificationEnabled) {
        return res.json({ verified: true });
      }
      let record = await prisma2.emailVerification.findUnique({ where: { email } });
      if (record && record.isVerified) {
        return res.json({ verified: true });
      }
      const otp = Math.floor(1e5 + Math.random() * 9e5).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1e3);
      if (record) {
        await prisma2.emailVerification.update({
          where: { email },
          data: { otp, otpExpiry }
        });
      } else {
        await prisma2.emailVerification.create({
          data: { email, otp, otpExpiry, isVerified: false }
        });
      }
      const mailOptions = {
        from: '"STM Digital Library" <info@celnet.in>',
        to: email,
        subject: "Your Email Verification OTP",
        html: buildEmail(`
          <h2 style="color: #1e3a6e;">Email Verification</h2>
          <p>Please use the following OTP to verify your email address. It is valid for 10 minutes.</p>
          <h1 style="letter-spacing: 4px; color: #2563eb; background: #f1f5f9; padding: 10px 20px; text-align: center; border-radius: 8px; width: max-content; margin: 20px auto;">${otp}</h1>
        `)
      };
      await sendMail(mailOptions);
      console.log(`
=========================================`);
      console.log(`\u{1F511} OTP FOR VERIFICATION (TESTING):`);
      console.log(`\u{1F4E7} Email: ${email}`);
      console.log(`\u{1F522} OTP: ${otp}`);
      console.log(`=========================================
`);
      res.json({ otpSent: true });
    } catch (err) {
      console.error("OTP send error:", err);
      res.status(500).json({ error: "Failed to send OTP" });
    }
  });
  app.post("/api/verify/confirm", async (req, res) => {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });
      const record = await prisma2.emailVerification.findUnique({ where: { email } });
      if (!record || record.isVerified) {
        return res.status(400).json({ error: "Invalid request or already verified" });
      }
      if (record.otp !== otp || !record.otpExpiry || record.otpExpiry < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }
      await prisma2.emailVerification.update({
        where: { email },
        data: { isVerified: true, otp: null, otpExpiry: null }
      });
      res.json({ success: true });
    } catch (err) {
      console.error("OTP verify error:", err);
      res.status(500).json({ error: "Failed to verify OTP" });
    }
  });
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name, organization, contact, designation } = req.body;
      const existingUser = await prisma2.user.findUnique({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
      }
      const hashedPassword = await import_bcryptjs.default.hash(password, 10);
      const userObj = await prisma2.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: name,
          organization: organization || "",
          contact: contact || "",
          designation: designation || "",
          role: email === "info@celnet.in" ? "SuperAdmin" : "Subscriber",
          status: "Active"
        }
      });
      const token = import_jsonwebtoken.default.sign({ uid: userObj.id, email, role: userObj.role }, JWT_SECRET, { expiresIn: "24h" });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: `\u{1F195} New User Registration \u2014 ${name}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F195} New Subscriber Alert</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">A new user has just registered on the platform.</p><table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:20px;"><tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">User Details</td></tr><tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${name}</td></tr><tr style="background:#fafbfc;"><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr><tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Contact</td><td style="padding:10px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${contact || "Not provided"}</td></tr><tr style="background:#fafbfc;"><td style="padding:10px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Designation</td><td style="padding:10px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${designation || "Not provided"}</td></tr><tr><td style="padding:10px 16px;font-size:12px;color:#94a3b8;">Organization</td><td style="padding:10px 16px;font-size:13px;color:#1e293b;">${organization || "Not provided"}</td></tr></table><div style="background:#eff6ff;border-left:4px solid #1e3a6e;border-radius:0 8px 8px 0;padding:12px 16px;"><p style="margin:0;font-size:13px;color:#1e3a6e;">\u26A1 <strong>Action:</strong> Review the new subscriber and assign a plan if needed.</p></div></td></tr>`
        )
      };
      const userMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: email,
        subject: `\u{1F389} Welcome to STM Digital Library, ${name}!`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><h3 style="margin:0 0 10px;font-size:17px;color:#1e3a6e;">Welcome aboard, ${name}! \u{1F393}</h3><p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Your account is ready. You now have access to STM Digital Library \u2014 your gateway to peer-reviewed journals, e-books, conference proceedings &amp; more.</p><table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;"><tr><td style="text-align:center;padding:14px 8px;background:#f0f9ff;border-radius:10px;"><div style="font-size:24px;margin-bottom:6px;">\u{1F4DA}</div><p style="margin:0;font-size:11px;font-weight:700;color:#0369a1;">50,000+<br/>Journals</p></td><td width="4"></td><td style="text-align:center;padding:14px 8px;background:#f0fdf4;border-radius:10px;"><div style="font-size:24px;margin-bottom:6px;">\u{1F3A5}</div><p style="margin:0;font-size:11px;font-weight:700;color:#15803d;">Educational<br/>Videos</p></td><td width="4"></td><td style="text-align:center;padding:14px 8px;background:#fdf4ff;border-radius:10px;"><div style="font-size:24px;margin-bottom:6px;">\u{1F4D6}</div><p style="margin:0;font-size:11px;font-weight:700;color:#7e22ce;">E-Books &amp;<br/>Theses</p></td></tr></table><div style="background:#1e3a6e;border-radius:10px;padding:18px 22px;margin-bottom:18px;"><p style="color:#93c5fd;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F680} Getting Started</p><p style="margin:4px 0;font-size:13px;color:#e2e8f0;"><span style="color:#86efac;font-weight:700;">01.</span> Log in at <strong>journalslibrary.com</strong></p><p style="margin:4px 0;font-size:13px;color:#e2e8f0;"><span style="color:#86efac;font-weight:700;">02.</span> Browse domains &amp; subscribe to your field</p><p style="margin:4px 0;font-size:13px;color:#e2e8f0;"><span style="color:#86efac;font-weight:700;">03.</span> Access full-text content instantly</p></div><p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a> or call <strong>+91-120-4781200</strong></p></td></tr>`
        )
      };
      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);
      const { password: _, ...profile } = userObj;
      res.json({ token, user: profile });
    } catch (error) {
      console.error("Signup Error:", error);
      res.status(500).json({ error: "Failed to create account" });
    }
  });
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (process.env.MASTER_ADMIN_EMAIL && process.env.MASTER_ADMIN_PASSWORD && email === process.env.MASTER_ADMIN_EMAIL && password === process.env.MASTER_ADMIN_PASSWORD) {
        let adminUser = await prisma2.user.findUnique({ where: { email } });
        if (!adminUser) {
          adminUser = await prisma2.user.create({
            data: {
              email,
              password: await import_bcryptjs.default.hash(password, 10),
              role: "SuperAdmin",
              displayName: "Super Admin"
            }
          });
        }
        const token2 = import_jsonwebtoken.default.sign(
          { uid: adminUser.id, email, role: "SuperAdmin" },
          JWT_SECRET,
          { expiresIn: "24h" }
        );
        const { password: _2, ...profile2 } = adminUser;
        return res.json({ token: token2, user: profile2 });
      }
      const userObj = await prisma2.user.findUnique({ where: { email } });
      if (!userObj) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      if (userObj.isBlocked) {
        return res.status(403).json({ error: "Your account has been blocked. Please contact support." });
      }
      if (userObj.isDemoAccount && userObj.demoExpiresAt && /* @__PURE__ */ new Date() > userObj.demoExpiresAt) {
        return res.status(403).json({ error: "Your demo account has expired. Please upgrade to continue." });
      }
      const isPasswordValid = await import_bcryptjs.default.compare(password, userObj.password);
      if (!isPasswordValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const token = import_jsonwebtoken.default.sign(
        { uid: userObj.id, email, role: userObj.role, institutionId: userObj.institutionId },
        JWT_SECRET,
        { expiresIn: "24h" }
      );
      const { password: _, ...profile } = userObj;
      res.json({ token, user: profile });
    } catch (error) {
      console.error("Login Error:", error);
      res.status(500).json({ error: "Failed to login" });
    }
  });
  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ error: "Email is required" });
      const userObj = await prisma2.user.findUnique({ where: { email } });
      if (!userObj) {
        return res.json({ message: "If your email is registered, an OTP has been sent." });
      }
      const otp = Math.floor(1e5 + Math.random() * 9e5).toString();
      const otpExpiry = new Date(Date.now() + 10 * 60 * 1e3);
      const record = await prisma2.emailVerification.findUnique({ where: { email } });
      if (record) {
        await prisma2.emailVerification.update({
          where: { email },
          data: { otp, otpExpiry }
        });
      } else {
        await prisma2.emailVerification.create({
          data: { email, otp, otpExpiry, isVerified: false }
        });
      }
      const mailOptions = {
        from: '"STM Digital Library" <info@celnet.in>',
        to: email,
        subject: "Password Reset OTP",
        html: buildEmail(`
          <h2 style="color: #1e3a6e;">Password Reset Request</h2>
          <p>We received a request to reset your password for your STM Digital Library account.</p>
          <p>Please use the following OTP to reset your password. It is valid for 10 minutes.</p>
          <h1 style="letter-spacing: 4px; color: #2563eb; background: #f1f5f9; padding: 10px 20px; text-align: center; border-radius: 8px; width: max-content; margin: 20px auto;">${otp}</h1>
          <p>If you did not request a password reset, please ignore this email.</p>
        `)
      };
      await sendMail(mailOptions);
      res.json({ message: "If your email is registered, an OTP has been sent." });
    } catch (error) {
      console.error("Forgot Password Error:", error);
      res.status(500).json({ error: "Failed to process request" });
    }
  });
  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { email, otp, newPassword } = req.body;
      if (!email || !otp || !newPassword) {
        return res.status(400).json({ error: "Email, OTP, and new password are required" });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
      }
      const record = await prisma2.emailVerification.findUnique({ where: { email } });
      if (!record) {
        return res.status(400).json({ error: "Invalid request" });
      }
      if (record.otp !== otp || !record.otpExpiry || record.otpExpiry < /* @__PURE__ */ new Date()) {
        return res.status(400).json({ error: "Invalid or expired OTP" });
      }
      const userObj = await prisma2.user.findUnique({ where: { email } });
      if (!userObj) {
        return res.status(404).json({ error: "User not found" });
      }
      const hashedPassword = await import_bcryptjs.default.hash(newPassword, 10);
      await prisma2.user.update({
        where: { email },
        data: { password: hashedPassword }
      });
      await prisma2.emailVerification.update({
        where: { email },
        data: { otp: null, otpExpiry: null }
      });
      res.json({ success: true, message: "Password has been successfully reset" });
    } catch (error) {
      console.error("Reset Password Error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  app.get("/api/auth/me", authenticateJWT, async (req, res) => {
    try {
      const userObj = await prisma2.user.findUnique({
        where: { email: req.user.email },
        include: {
          quotations: { orderBy: { createdAt: "desc" } },
          subscriptions: { orderBy: { createdAt: "desc" } },
          submissions: { orderBy: { createdAt: "desc" } }
        }
      });
      if (!userObj) {
        return res.status(404).json({ error: "User not found" });
      }
      const emailVerif = await prisma2.emailVerification.findUnique({
        where: { email: userObj.email },
        select: { isVerified: true }
      });
      const { password: _, ...profile } = userObj;
      res.json({ ...profile, isEmailVerified: emailVerif?.isVerified || false });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch user" });
    }
  });
  const requireSuperAdmin = (req, res, next) => {
    if (req.user?.role !== "SuperAdmin") return res.status(403).json({ error: "Access denied" });
    next();
  };
  const requireAdminOrManager = (req, res, next) => {
    const role = req.user?.role;
    if (role !== "SuperAdmin" && role !== "SubscriptionManager") {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
  app.get("/api/admin/settings/email", authenticateJWT, requireAdminOrManager, (req, res) => {
    const settings = getSystemSettings();
    res.json({
      awsAccessKeyId: settings.awsAccessKeyId || "",
      awsSecretAccessKey: settings.awsSecretAccessKey ? "********" : "",
      // Masked
      awsRegion: settings.awsRegion || "us-west-2",
      emailFrom: settings.emailFrom || ""
    });
  });
  app.post("/api/admin/settings/email", authenticateJWT, requireAdminOrManager, (req, res) => {
    const settings = getSystemSettings();
    const { awsAccessKeyId, awsSecretAccessKey, awsRegion, emailFrom } = req.body;
    if (awsAccessKeyId) settings.awsAccessKeyId = awsAccessKeyId;
    if (awsSecretAccessKey && awsSecretAccessKey !== "********") {
      settings.awsSecretAccessKey = awsSecretAccessKey;
    }
    if (awsRegion) settings.awsRegion = awsRegion;
    if (emailFrom) settings.emailFrom = emailFrom;
    setSystemSettings(settings);
    res.json({ success: true, message: "Email settings saved successfully" });
  });
  app.post("/api/admin/settings/email/test", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { to } = req.body;
      if (!to) return res.status(400).json({ error: "Missing recipient email" });
      await sendMail({
        to,
        subject: "Test Email from STM Digital Library",
        html: `<p>This is a test email sent from the STM Digital Library Admin Dashboard.</p><p>If you received this, your email configuration is working perfectly!</p>`,
        _isTestEmail: true
        // Flag to throw error instead of swallowing
      });
      res.json({ success: true, message: "Test email sent successfully!" });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to send test email" });
    }
  });
  app.get("/api/admin/email-logs", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const logs = await prisma2.emailLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 100
        // Limit to last 100 logs
      });
      res.json(logs);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch email logs" });
    }
  });
  app.post("/api/admin/email-logs/:id/resend", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const logId = req.params.id;
      const log = await prisma2.emailLog.findUnique({ where: { id: logId } });
      if (!log) return res.status(404).json({ error: "Log not found" });
      if (!log.htmlContent) return res.status(400).json({ error: "Email content not available for resending (older log without HTML stored)." });
      await sendMail({
        to: log.to,
        subject: log.subject,
        html: log.htmlContent,
        _isTestEmail: true
        // Throw error explicitly instead of silent catch
      }, false);
      await prisma2.emailLog.update({
        where: { id: logId },
        data: { status: "Sent", error: null, createdAt: /* @__PURE__ */ new Date() }
      });
      res.json({ success: true, message: "Email resent successfully!" });
    } catch (err) {
      res.status(500).json({ error: err.message || "Failed to resend email" });
    }
  });
  app.get("/api/admin/stats", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const CONTENT_TYPES = ["Books", "Periodicals", "Magazines", "Case Reports", "Theses", "Conference Proceedings", "Educational Videos", "Newsletters"];
      const [users, payments, subscriptions, quotations, contentCounts, pendingRequests, totalContent] = await Promise.all([
        prisma2.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
        prisma2.payment.findMany({ orderBy: { createdAt: "desc" }, take: 5, include: { user: true } }),
        prisma2.subscription.findMany({ orderBy: { createdAt: "desc" }, include: { user: true } }),
        prisma2.quotation.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
        Promise.all(CONTENT_TYPES.map(async (ct) => ({
          name: ct,
          value: await prisma2.content.count({ where: { contentType: ct } })
        }))),
        prisma2.subscriptionRequest.count({ where: { status: "Pending" } }),
        prisma2.content.count()
      ]);
      const totalUsers = await prisma2.user.count();
      const totalPublished = await prisma2.content.count({ where: { status: { in: ["Published", "published"] } } });
      const totalDrafted = await prisma2.content.count({ where: { status: { notIn: ["Published", "published"] } } });
      const now = /* @__PURE__ */ new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const currentMonthPayments = await prisma2.payment.aggregate({ _sum: { amount: true }, where: { status: "Success", createdAt: { gte: startOfCurrentMonth } } });
      const prevMonthPayments = await prisma2.payment.aggregate({ _sum: { amount: true }, where: { status: "Success", createdAt: { gte: startOfPreviousMonth, lt: startOfCurrentMonth } } });
      const currentRev = currentMonthPayments._sum.amount || 0;
      const prevRev = prevMonthPayments._sum.amount || 0;
      const revenueGrowthPct = prevRev === 0 ? currentRev > 0 ? 100 : 0 : Number(((currentRev - prevRev) / prevRev * 100).toFixed(1));
      const currentUsers = await prisma2.user.count({ where: { createdAt: { gte: startOfCurrentMonth } } });
      const prevUsers = await prisma2.user.count({ where: { createdAt: { gte: startOfPreviousMonth, lt: startOfCurrentMonth } } });
      const userGrowthPct = prevUsers === 0 ? currentUsers > 0 ? 100 : 0 : Number(((currentUsers - prevUsers) / prevUsers * 100).toFixed(1));
      const domainGroups = await prisma2.content.groupBy({
        by: ["domain"],
        _count: { id: true },
        where: { domain: { not: null } }
      });
      const domainsData = domainGroups.map((d) => ({
        name: d.domain,
        count: d._count.id
      })).sort((a, b) => b.count - a.count).slice(0, 10);
      const currentMonth = (/* @__PURE__ */ new Date()).toLocaleString("default", { month: "short" });
      const revenueData = [
        { name: "Oct", revenue: 45e3 },
        { name: "Nov", revenue: 52e3 },
        { name: "Dec", revenue: 48e3 },
        { name: "Jan", revenue: 61e3 },
        { name: "Feb", revenue: 59e3 },
        { name: "Mar", revenue: 75e3 },
        { name: currentMonth, revenue: payments.filter((p) => p.status === "Success").reduce((acc, p) => acc + p.amount, 0) || 82e3 }
      ];
      const userGrowthData = [
        { name: "Oct", users: 120 },
        { name: "Nov", users: 145 },
        { name: "Dec", users: 160 },
        { name: "Jan", users: 210 },
        { name: "Feb", users: 250 },
        { name: "Mar", users: 310 },
        { name: currentMonth, users: totalUsers }
      ];
      const contentGrowthData = [
        { name: "Oct", items: Math.floor(totalContent * 0.4) },
        { name: "Nov", items: Math.floor(totalContent * 0.5) },
        { name: "Dec", items: Math.floor(totalContent * 0.65) },
        { name: "Jan", items: Math.floor(totalContent * 0.75) },
        { name: "Feb", items: Math.floor(totalContent * 0.85) },
        { name: "Mar", items: Math.floor(totalContent * 0.95) },
        { name: currentMonth, items: totalContent }
      ];
      const geoPoints = [
        { id: "IND", value: 450, coordinates: [78.9629, 20.5937] },
        // India
        { id: "USA", value: 320, coordinates: [-95.7129, 37.0902] },
        // USA
        { id: "GBR", value: 180, coordinates: [-3.4359, 55.3781] },
        // UK
        { id: "CAN", value: 150, coordinates: [-106.3468, 56.1304] },
        // Canada
        { id: "AUS", value: 120, coordinates: [133.7751, -25.2744] },
        // Australia
        { id: "DEU", value: 90, coordinates: [10.4515, 51.1657] }
        // Germany
      ];
      res.json({
        users,
        payments,
        subscriptions,
        quotations,
        contentTypeCounts: contentCounts.filter((c) => c.value > 0),
        domainsData,
        revenueData,
        userGrowthData,
        contentGrowthData,
        geoPoints: [],
        _stats: {
          totalUsers,
          totalContent,
          totalPublished,
          totalDrafted,
          totalRevenue: payments.filter((p) => p.status === "Success").reduce((acc, p) => acc + p.amount, 0),
          activeSubscriptions: subscriptions.filter((s2) => s2.status === "Active").length,
          pendingRequests,
          contentGrowthPct: 0,
          // Not highly relevant unless explicitly tracking creation dates
          revenueGrowthPct,
          userGrowthPct
        }
      });
    } catch (error) {
      console.error("Admin stats error:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app.get("/api/admin/settings", authenticateJWT, requireSuperAdmin, (req, res) => {
    res.json(getSystemSettings());
  });
  app.post("/api/admin/settings", authenticateJWT, requireSuperAdmin, (req, res) => {
    const { emailVerificationEnabled, publisherSafeMode, hidePricing } = req.body;
    const settings = getSystemSettings();
    if (typeof emailVerificationEnabled !== "undefined") {
      settings.emailVerificationEnabled = Boolean(emailVerificationEnabled);
    }
    if (typeof publisherSafeMode !== "undefined") {
      settings.publisherSafeMode = Boolean(publisherSafeMode);
    }
    if (typeof hidePricing !== "undefined") {
      settings.hidePricing = Boolean(hidePricing);
    }
    setSystemSettings(settings);
    res.json(settings);
  });
  app.get("/api/admin/india-state-stats", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const [usersByState, quotationsByState, contactsByState, totalUsers, totalSubscriptions, totalRevenue] = await Promise.all([
        prisma2.user.groupBy({ by: ["state"], _count: { id: true }, where: { state: { not: null, notIn: ["", "null"] } } }),
        prisma2.quotation.groupBy({ by: ["state"], _count: { id: true }, where: { state: { not: null, notIn: ["", "null"] } } }),
        prisma2.contactInquiry.groupBy({ by: ["state"], _count: { id: true }, where: { state: { not: null, notIn: ["", "null"] } } }),
        prisma2.user.count({ where: { role: { not: "SuperAdmin" } } }),
        prisma2.subscription.count({ where: { status: "Active" } }),
        prisma2.payment.aggregate({ _sum: { amount: true }, where: { status: "Success" } })
      ]);
      const stateMap = {};
      const add = (state, field, count) => {
        if (!state || state === "null") return;
        const s2 = state.trim();
        if (!s2) return;
        if (!stateMap[s2]) stateMap[s2] = { users: 0, quotations: 0, contacts: 0, total: 0 };
        stateMap[s2][field] += count;
        stateMap[s2].total += count;
      };
      for (const u of usersByState) add(u.state, "users", u._count.id);
      for (const q of quotationsByState) add(q.state, "quotations", q._count.id);
      for (const c of contactsByState) add(c.state, "contacts", c._count.id);
      res.json({
        stateMap,
        meta: {
          stateUsers: usersByState.reduce((s2, u) => s2 + u._count.id, 0),
          stateQuotations: quotationsByState.reduce((s2, q) => s2 + q._count.id, 0),
          stateContacts: contactsByState.reduce((s2, c) => s2 + c._count.id, 0),
          activeStates: Object.keys(stateMap).length,
          totalUsers,
          totalSubscriptions,
          totalRevenue: totalRevenue._sum?.amount || 0
        }
      });
    } catch (error) {
      console.error("India state stats error:", error);
      res.status(500).json({ error: "Failed to fetch state stats" });
    }
  });
  app.get("/api/user/dashboard", authenticateJWT, async (req, res) => {
    try {
      const subscriptions = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const payments = await prisma2.payment.findMany({ where: { userId: req.user.uid, status: "Success" } });
      const recentViews = await prisma2.studentActivity.findMany({
        where: { userId: req.user.uid },
        orderBy: { accessedAt: "desc" },
        take: 6,
        include: { content: true }
      });
      const mappedRecent = recentViews.map((rv) => ({
        id: rv.contentId,
        title: rv.content?.title || "Unknown",
        type: rv.content?.contentType || "Book",
        domain: rv.content?.domain || "",
        lastPage: rv.lastPage || 1,
        date: rv.accessedAt.toISOString()
      }));
      const activeSubs = subscriptions;
      const nearestExpiry = activeSubs.sort((a, b) => new Date(a.endDate).getTime() - new Date(b.endDate).getTime())[0]?.endDate || null;
      const totalSpent = payments.reduce((acc, p) => acc + p.amount, 0);
      const OR_clauses = [{ userId: req.user.uid }];
      if (req.user.institutionId) {
        OR_clauses.push({ institutionId: req.user.institutionId });
      } else {
        const u = await prisma2.user.findUnique({ where: { id: req.user.uid }, select: { institutionId: true } });
        if (u?.institutionId) OR_clauses.push({ institutionId: u.institutionId });
      }
      const allSubscriptions = await prisma2.subscription.findMany({
        where: { OR: OR_clauses },
        orderBy: { endDate: "desc" }
      });
      const expiredSubs = allSubscriptions.filter((sub) => sub.status !== "Active" || new Date(sub.endDate) < /* @__PURE__ */ new Date());
      const allowedDomains = Array.from(new Set(
        activeSubs.flatMap((s2) => {
          const d = Array.isArray(s2.domains) ? s2.domains : s2.domains ? JSON.parse(s2.domains) : [];
          return d;
        }).filter(Boolean)
      ));
      res.json({
        activeSubscriptions: activeSubs.length,
        nearestExpiry,
        totalSpent,
        allowedDomains,
        recentActivity: mappedRecent,
        planType: activeSubs[0]?.planType || "Free/Demo",
        planName: activeSubs[0]?.planName || "Basic Plan",
        expiredSubscriptions: expiredSubs
      });
    } catch (error) {
      console.error("User dashboard error:", error);
      res.status(500).json({ error: "Failed to load dashboard" });
    }
  });
  app.get("/api/user/history", authenticateJWT, async (req, res) => {
    try {
      const recentViews = await prisma2.studentActivity.findMany({
        where: { userId: req.user.uid },
        orderBy: { accessedAt: "desc" },
        take: 100,
        include: { content: true }
      });
      res.json(recentViews);
    } catch (error) {
      console.error("User history error:", error);
      res.status(500).json({ error: "Failed to load history" });
    }
  });
  app.patch("/api/user/reading-progress", authenticateJWT, async (req, res) => {
    try {
      const { contentId, lastPage, timeSpent } = req.body;
      if (!contentId || !lastPage) return res.status(400).json({ error: "contentId and lastPage are required" });
      const existing = await prisma2.studentActivity.findFirst({
        where: { userId: req.user.uid, contentId }
      });
      if (existing) {
        await prisma2.studentActivity.update({
          where: { id: existing.id },
          data: { lastPage: Number(lastPage), timeSpent: { increment: Number(timeSpent) || 0 } }
        });
        res.json({ success: true, lastPage: Number(lastPage) });
      } else {
        await prisma2.studentActivity.create({
          data: { userId: req.user.uid, contentId, lastPage: Number(lastPage), timeSpent: Number(timeSpent) || 0 }
        });
        res.json({ success: true, lastPage: Number(lastPage) });
      }
    } catch (error) {
      console.error("Reading progress save error:", error);
      res.status(500).json({ error: "Failed to save reading progress" });
    }
  });
  app.get("/api/user/reading-progress/:contentId", authenticateJWT, async (req, res) => {
    try {
      const activity = await prisma2.studentActivity.findFirst({
        where: { userId: req.user.uid, contentId: req.params.contentId }
      });
      res.json({ lastPage: activity?.lastPage || 1, accessedAt: activity?.accessedAt || null });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reading progress" });
    }
  });
  app.get("/api/user/favorites", authenticateJWT, async (req, res) => {
    try {
      const favorites = await prisma2.favorite.findMany({
        where: { userId: req.user.uid },
        include: { content: true },
        orderBy: { createdAt: "desc" }
      });
      res.json(favorites.map((f3) => ({ ...f3.content, favoriteId: f3.id, favoritedAt: f3.createdAt })));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch favorites" });
    }
  });
  app.post("/api/user/favorites", authenticateJWT, async (req, res) => {
    try {
      const { contentId } = req.body;
      if (!contentId) return res.status(400).json({ error: "contentId is required" });
      const existing = await prisma2.favorite.findFirst({
        where: { userId: req.user.uid, contentId }
      });
      if (existing) {
        await prisma2.favorite.delete({ where: { id: existing.id } });
        return res.json({ success: true, favorited: false });
      } else {
        await prisma2.favorite.create({
          data: { userId: req.user.uid, contentId }
        });
        return res.json({ success: true, favorited: true });
      }
    } catch (error) {
      console.error("Favorite toggle error:", error);
      res.status(500).json({ error: "Failed to toggle favorite" });
    }
  });
  app.get("/api/user/favorites/check/:contentId", authenticateJWT, async (req, res) => {
    try {
      const existing = await prisma2.favorite.findFirst({
        where: { userId: req.user.uid, contentId: req.params.contentId }
      });
      res.json({ favorited: !!existing });
    } catch (error) {
      res.status(500).json({ error: "Failed to check favorite status" });
    }
  });
  app.get("/api/user/subscriptions", authenticateJWT, async (req, res) => {
    try {
      const OR_clauses = [{ userId: req.user.uid }];
      if (req.user.institutionId) {
        OR_clauses.push({ institutionId: req.user.institutionId });
      } else if (req.user.role === "Institution" || req.user.role === "Student" || req.user.role === "Subscriber") {
        const u = await prisma2.user.findUnique({ where: { id: req.user.uid }, select: { institutionId: true } });
        if (u?.institutionId) OR_clauses.push({ institutionId: u.institutionId });
      }
      const subscriptions = await prisma2.subscription.findMany({
        where: { OR: OR_clauses },
        orderBy: { startDate: "desc" }
      });
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to load subscriptions" });
    }
  });
  const getUserActiveSubscriptions = async (uid, role, institutionId) => {
    const OR_clauses = [{ userId: uid }];
    let resolvedInstId = institutionId;
    if (!resolvedInstId) {
      const u = await prisma2.user.findUnique({ where: { id: uid }, select: { institutionId: true } });
      if (u?.institutionId) resolvedInstId = u.institutionId;
    }
    if (resolvedInstId) {
      OR_clauses.push({ institutionId: resolvedInstId });
    }
    return prisma2.subscription.findMany({
      where: {
        OR: OR_clauses,
        status: "Active",
        endDate: { gt: /* @__PURE__ */ new Date() }
      }
    });
  };
  const checkContentAccess = (content, userRole, activeSubscriptions) => {
    if (userRole === "SuperAdmin" || userRole === "Admin" || userRole === "ContentManager") return true;
    return activeSubscriptions.some((sub) => {
      const d = Array.isArray(sub.domains) ? sub.domains : sub.domains ? JSON.parse(sub.domains) : [];
      const hasWildcardDomain = d.length === 0 && !sub.domainName;
      let domainMatch = false;
      if (hasWildcardDomain) {
        domainMatch = true;
      } else {
        const safeContentDomain = content.domain ? content.domain.toLowerCase() : "";
        domainMatch = d.some((subDomain) => {
          if (!subDomain) return false;
          const safeSub = subDomain.toLowerCase();
          return safeSub.includes(safeContentDomain) || safeContentDomain.includes(safeSub);
        }) || sub.domainName && (sub.domainName.toLowerCase().includes(safeContentDomain) || safeContentDomain.includes(sub.domainName.toLowerCase()));
      }
      if (!domainMatch) return false;
      const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : sub.contentTypes ? JSON.parse(sub.contentTypes) : [];
      if (ct.length === 0) return true;
      return ct.includes(content.contentType);
    });
  };
  app.get("/api/user/content-access", authenticateJWT, async (req, res) => {
    try {
      const activeSubscriptions = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const realCounts = await prisma2.content.groupBy({
        by: ["domain", "contentType"],
        _count: { id: true },
        where: { status: { in: ["Published", "published"] } }
      });
      const uniqueModules = realCounts.filter((rc) => rc.domain && rc.contentType).map((rc) => ({
        id: `${rc.domain}_${rc.contentType}`,
        domain: rc.domain,
        contentType: rc.contentType,
        totalCount: rc._count.id
      }));
      const accessMap = uniqueModules.map((mod) => {
        const mockContent = { domain: mod.domain, contentType: mod.contentType };
        return {
          ...mod,
          hasAccess: checkContentAccess(mockContent, req.user.role, activeSubscriptions)
        };
      });
      const grouped = accessMap.reduce((acc, curr) => {
        if (!acc[curr.domain]) acc[curr.domain] = [];
        acc[curr.domain].push(curr);
        return acc;
      }, {});
      res.json(grouped);
    } catch (error) {
      res.status(500).json({ error: "Failed to load access map" });
    }
  });
  app.get("/api/user/access-scope", authenticateJWT, async (req, res) => {
    try {
      const role = req.user.role;
      if (["SuperAdmin", "Admin", "ContentManager"].includes(role)) {
        return res.json({ all: true, domains: [], contentTypes: [] });
      }
      const subs = await getUserActiveSubscriptions(req.user.uid, role, req.user.institutionId);
      const domains = /* @__PURE__ */ new Set();
      const contentTypes = /* @__PURE__ */ new Set();
      for (const s2 of subs || []) {
        const d = Array.isArray(s2.domains) ? s2.domains : s2.domains ? JSON.parse(s2.domains) : [];
        const c = Array.isArray(s2.contentTypes) ? s2.contentTypes : s2.contentTypes ? JSON.parse(s2.contentTypes) : [];
        d.forEach((x2) => x2 && domains.add(x2));
        c.forEach((x2) => x2 && contentTypes.add(x2));
        if (s2.domainName) domains.add(s2.domainName);
      }
      res.json({ all: false, domains: [...domains], contentTypes: [...contentTypes] });
    } catch (e2) {
      console.error("access-scope error:", e2);
      res.status(500).json({ error: "Failed to load access scope" });
    }
  });
  app.get("/api/user/available-facets", authenticateJWT, async (req, res) => {
    try {
      const role = req.user.role;
      const isAdmin = ["SuperAdmin", "Admin", "ContentManager"].includes(role);
      const subs = isAdmin ? [] : await getUserActiveSubscriptions(req.user.uid, role, req.user.institutionId) || [];
      const scopeDomains = /* @__PURE__ */ new Set();
      const scopeTypes = /* @__PURE__ */ new Set();
      const subOr = [];
      for (const sub of subs) {
        const d = Array.isArray(sub.domains) ? sub.domains : sub.domains ? JSON.parse(sub.domains) : [];
        const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : sub.contentTypes ? JSON.parse(sub.contentTypes) : [];
        d.forEach((x2) => x2 && scopeDomains.add(x2));
        ct.forEach((x2) => x2 && scopeTypes.add(x2));
        if (sub.domainName) scopeDomains.add(sub.domainName);
        const cond = {};
        const dOr = [];
        d.forEach((s2) => s2 && dOr.push({ domain: { contains: s2, mode: "insensitive" } }));
        if (sub.domainName) dOr.push({ domain: { contains: sub.domainName, mode: "insensitive" } });
        if (dOr.length) cond.OR = dOr;
        if (ct.length) cond.contentType = { in: ct };
        if (Object.keys(cond).length) subOr.push(cond);
      }
      let legacyDepts = [];
      let legacyTypes = [];
      if (isAdmin || subs.length) {
        const legacyWhere = { status: { not: "Draft" } };
        if (!isAdmin && subOr.length) legacyWhere.AND = [{ OR: subOr }];
        const [dg, cg] = await Promise.all([
          prisma2.content.groupBy({ by: ["domain"], where: legacyWhere }),
          prisma2.content.groupBy({ by: ["contentType"], where: legacyWhere })
        ]);
        legacyDepts = dg.map((x2) => x2.domain).filter(Boolean);
        legacyTypes = cg.map((x2) => x2.contentType).filter(Boolean);
      }
      const domFilter = isAdmin ? {} : { domain: { in: [...scopeDomains] } };
      const [aDepts, bDepts, aCount, bCount] = await Promise.all([
        prisma2.article.groupBy({ by: ["domain"], where: { status: "Published", ...domFilter } }),
        prisma2.book.groupBy({ by: ["domain"], where: { status: "Published", ...domFilter } }),
        prisma2.article.count({ where: { status: "Published", ...domFilter } }),
        prisma2.book.count({ where: { status: "Published", ...domFilter } })
      ]);
      const newDepts = [...new Set([...aDepts.map((x2) => x2.domain), ...bDepts.map((x2) => x2.domain)].filter(Boolean))];
      const [adg, acg] = await Promise.all([
        prisma2.content.groupBy({ by: ["domain"], where: { status: { not: "Draft" } } }),
        prisma2.content.groupBy({ by: ["contentType"], where: { status: { not: "Draft" } } })
      ]);
      res.json({
        all: isAdmin,
        scope: { domains: [...scopeDomains], contentTypes: [...scopeTypes] },
        legacy: { departments: legacyDepts, contentTypes: legacyTypes },
        neu: { departments: newDepts, hasArticles: aCount > 0, hasBooks: bCount > 0 && (isAdmin || scopeTypes.has("Books")) },
        archived: { departments: adg.map((x2) => x2.domain).filter(Boolean), contentTypes: acg.map((x2) => x2.contentType).filter(Boolean) }
      });
    } catch (e2) {
      console.error("available-facets error:", e2);
      res.status(500).json({ error: "Failed to load facets" });
    }
  });
  app.get("/api/content/filters", async (req, res) => {
    try {
      const { domain, subjectArea, contentType, search } = req.query;
      const where = { status: "Published" };
      if (domain) {
        const domainList = String(domain).split(",").map((d) => d.trim()).filter(Boolean);
        if (domainList.length > 1) {
          where.domain = { in: domainList };
        } else if (domainList.length === 1) {
          where.domain = domainList[0];
        }
      }
      if (contentType) where.contentType = String(contentType);
      if (search) {
        const query = String(search);
        where.OR = [
          { title: { contains: query, mode: "insensitive" } },
          { authors: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { subjectArea: { contains: query, mode: "insensitive" } }
        ];
      }
      if (String(req.query.onlyUnlocked) === "true") {
        const authHeader = req.headers.authorization;
        let ud = null;
        if (authHeader) {
          try {
            ud = import_jsonwebtoken.default.verify(authHeader.split(" ")[1], JWT_SECRET);
          } catch {
          }
        }
        if (ud && !["SuperAdmin", "Admin", "ContentManager"].includes(ud.role)) {
          const subs = await getUserActiveSubscriptions(ud.uid, ud.role, ud.institutionId);
          if (!subs.length) return res.json({ domains: [], subjects: [], tags: [] });
          const subOr = [];
          for (const sub of subs) {
            const d = Array.isArray(sub.domains) ? sub.domains : sub.domains ? JSON.parse(sub.domains) : [];
            const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : sub.contentTypes ? JSON.parse(sub.contentTypes) : [];
            const cond = {};
            const dOr = [];
            d.forEach((s2) => s2 && dOr.push({ domain: { contains: s2, mode: "insensitive" } }));
            if (sub.domainName) dOr.push({ domain: { contains: sub.domainName, mode: "insensitive" } });
            if (dOr.length) cond.OR = dOr;
            if (ct.length) cond.contentType = { in: ct };
            if (Object.keys(cond).length) subOr.push(cond);
          }
          if (subOr.length) {
            where.AND = where.AND || [];
            where.AND.push({ OR: subOr });
          }
        }
      }
      const contents = await prisma2.content.findMany({
        where,
        select: { domain: true, subjectArea: true, tags: true }
      });
      const subjectsSet = /* @__PURE__ */ new Set();
      const tagsSet = /* @__PURE__ */ new Set();
      const domainsSet = /* @__PURE__ */ new Set();
      const selectedSubjects = subjectArea ? String(subjectArea).split(",").map((s2) => s2.trim().toLowerCase()).filter(Boolean) : [];
      contents.forEach((c) => {
        if (c.domain) domainsSet.add(c.domain.trim());
        if (c.subjectArea) subjectsSet.add(c.subjectArea.trim());
        let shouldAddTags = true;
        if (selectedSubjects.length > 0) {
          const cSub = c.subjectArea ? c.subjectArea.trim().toLowerCase() : "";
          if (!selectedSubjects.includes(cSub)) {
            shouldAddTags = false;
          }
        }
        if (shouldAddTags && c.tags) {
          const tagsArray = Array.isArray(c.tags) ? c.tags : typeof c.tags === "string" ? c.tags.split(",") : [];
          tagsArray.forEach((t2) => {
            if (typeof t2 === "string") {
              const trimmed = t2.trim();
              if (trimmed) tagsSet.add(trimmed);
            }
          });
        }
      });
      res.json({
        domains: Array.from(domainsSet).sort(),
        subjects: Array.from(subjectsSet).sort(),
        tags: Array.from(tagsSet).sort()
      });
    } catch (error) {
      console.error("Filter fetch error:", error);
      res.status(500).json({ error: "Failed to fetch filters" });
    }
  });
  app.get("/api/content/list", async (req, res) => {
    try {
      const { domain, contentType, search, subjectArea, tag, page = "1", limit = "20", onlyUnlocked } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const take = parseInt(limit);
      const where = { status: { not: "Draft" } };
      if (domain) {
        const doms = String(domain).split(",").map((s2) => s2.trim()).filter(Boolean);
        if (doms.length === 1) where.domain = doms[0];
        else if (doms.length > 1) where.domain = { in: doms };
      }
      if (contentType) where.contentType = String(contentType);
      if (subjectArea) {
        const subjects = String(subjectArea).split(",").map((s2) => s2.trim()).filter(Boolean);
        if (subjects.length > 0) {
          if (subjects.length === 1) {
            where.subjectArea = { equals: subjects[0], mode: "insensitive" };
          } else {
            where.subjectArea = { in: subjects };
          }
        }
      }
      if (tag) {
        const tags = String(tag).split(",").map((t2) => t2.trim()).filter(Boolean);
        if (tags.length > 0) {
          if (tags.length === 1) {
            where.tags = { array_contains: tags[0] };
          } else {
            where.AND = where.AND || [];
            where.AND.push({
              OR: tags.map((t2) => ({ tags: { array_contains: t2 } }))
            });
          }
        }
      }
      if (search) {
        where.OR = [
          { title: { contains: String(search), mode: "insensitive" } },
          { authors: { contains: String(search), mode: "insensitive" } },
          { description: { contains: String(search), mode: "insensitive" } },
          { subjectArea: { contains: String(search), mode: "insensitive" } },
          { tags: { array_contains: String(search) } }
        ];
      }
      const authHeader = req.headers.authorization;
      let userDetails = null;
      if (authHeader) {
        const token = authHeader.split(" ")[1];
        try {
          userDetails = import_jsonwebtoken.default.verify(token, JWT_SECRET);
        } catch (e2) {
          console.log("JWT Error:", e2);
        }
      }
      if (onlyUnlocked === "true" && userDetails) {
        if (userDetails.role !== "SuperAdmin" && userDetails.role !== "Admin" && userDetails.role !== "ContentManager") {
          const activeSubs2 = await getUserActiveSubscriptions(userDetails.uid, userDetails.role, userDetails.institutionId);
          if (activeSubs2.length === 0) {
            return res.json({ data: [], total: 0, page: parseInt(page), limit: take });
          }
          const subOrConditions = [];
          for (const sub of activeSubs2) {
            const d = Array.isArray(sub.domains) ? sub.domains : sub.domains ? JSON.parse(sub.domains) : [];
            const ct = Array.isArray(sub.contentTypes) ? sub.contentTypes : sub.contentTypes ? JSON.parse(sub.contentTypes) : [];
            const condition = {};
            const domainOr = [];
            if (d.length > 0) {
              d.forEach((domainStr) => {
                if (domainStr) domainOr.push({ domain: { contains: domainStr, mode: "insensitive" } });
              });
            }
            if (sub.domainName) {
              domainOr.push({ domain: { contains: sub.domainName, mode: "insensitive" } });
            }
            if (domainOr.length > 0) {
              condition.OR = domainOr;
            }
            if (ct.length > 0) {
              condition.contentType = { in: ct };
            }
            if (Object.keys(condition).length === 0) {
              subOrConditions.push({});
            } else {
              subOrConditions.push(condition);
            }
          }
          if (subOrConditions.length > 0) {
            const hasWildcard = subOrConditions.some((c) => Object.keys(c).length === 0);
            if (!hasWildcard) {
              where.AND = where.AND || [];
              where.AND.push({ OR: subOrConditions });
            }
          }
        }
        const [contents2, total2] = await Promise.all([
          prisma2.content.findMany({ where, skip, take, orderBy: { title: "asc" } }),
          prisma2.content.count({ where })
        ]);
        return res.json({
          data: contents2.map((c) => ({ ...c, locked: false })),
          total: total2,
          page: parseInt(page),
          limit: take
        });
      }
      const [contents, total] = await Promise.all([
        prisma2.content.findMany({ where, skip, take, orderBy: { title: "asc" } }),
        prisma2.content.count({ where })
      ]);
      if (!userDetails) {
        return res.json({
          data: contents.map((c) => ({ ...c, locked: true, fileUrl: null })),
          total,
          page: parseInt(page),
          limit: take
        });
      }
      const activeSubs = await getUserActiveSubscriptions(userDetails.uid, userDetails.role, userDetails.institutionId);
      const protectedContents = contents.map((c) => {
        const hasAccess = checkContentAccess(c, userDetails.role, activeSubs);
        if (!hasAccess) {
          return { ...c, fileUrl: null, locked: true };
        }
        return { ...c, locked: false };
      });
      res.json({ data: protectedContents, total, page: parseInt(page), limit: take });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to load content list" });
    }
  });
  const resolveViewable = async (id, isAdmin) => {
    const c = await prisma2.content.findFirst({ where: isAdmin ? { id } : { id, status: { not: "Draft" } } });
    if (c) return { kind: "content", item: c, fileUrl: c.fileUrl, title: c.title, contentType: c.contentType, accessType: c.accessType, status: c.status };
    const a = await prisma2.article.findFirst({ where: isAdmin ? { id } : { id, status: "Published" } });
    if (a) return { kind: "article", item: a, fileUrl: a.pdfUrl, title: a.title, contentType: a.contentType || "Periodicals", accessType: a.accessType || "OpenAccess", status: a.status };
    const b = await prisma2.book.findFirst({ where: isAdmin ? { id } : { id, status: "Published" } });
    if (b) return { kind: "book", item: b, fileUrl: b.pdfUrl, title: b.title, contentType: "Books", accessType: b.accessType || "OpenAccess", status: b.status };
    return null;
  };
  app.get("/api/content/:id/view", authenticateJWT, async (req, res) => {
    try {
      const contentId = req.params.id;
      const isAdminRole = ["SuperAdmin", "Admin", "ContentManager"].includes(req.user.role);
      const resolved = await resolveViewable(contentId, isAdminRole);
      if (!resolved) return res.status(404).json({ error: "Content not found" });
      const isOA = ["OpenAccess", "Free"].includes(resolved.accessType || "");
      let hasAccess = true;
      if (resolved.kind === "content" && !isOA) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        hasAccess = checkContentAccess(resolved.item, req.user.role, activeSubs);
      }
      if (!hasAccess) return res.status(403).json({ error: "Access denied. Please upgrade your subscription." });
      if ((resolved.kind === "article" || resolved.kind === "book") && !isAdminRole) {
        prisma2[resolved.kind].update({ where: { id: resolved.item.id }, data: { views: { increment: 1 } } }).catch(() => {
        });
        prisma2.readEvent.create({ data: { itemType: resolved.kind, itemId: resolved.item.id, publisherId: resolved.item.publisherId || null, userId: req.user.uid } }).catch(() => {
        });
      }
      if (resolved.kind === "content" && (req.user.role === "Student" || req.user.role === "Subscriber")) {
        try {
          const existing = await prisma2.studentActivity.findFirst({ where: { userId: req.user.uid, contentId: resolved.item.id } });
          if (existing) await prisma2.studentActivity.update({ where: { id: existing.id }, data: { accessedAt: /* @__PURE__ */ new Date() } });
          else await prisma2.studentActivity.create({ data: { userId: req.user.uid, contentId: resolved.item.id, timeSpent: 0, lastPage: 1 } });
        } catch (e2) {
          console.error("Activity log failed", e2);
        }
      }
      return res.json({ url: resolved.fileUrl, title: resolved.title, contentType: resolved.contentType });
    } catch (error) {
      res.status(500).json({ error: "Failed to view content" });
    }
  });
  app.get("/api/content/:id/proxy-pdf", authenticateJWT, async (req, res) => {
    try {
      const contentId = req.params.id;
      const isAdmin = req.user.role === "SuperAdmin" || req.user.role === "Admin";
      const resolved = await resolveViewable(contentId, isAdmin);
      if (!resolved || !resolved.fileUrl) {
        return res.status(404).json({ error: "Content not found" });
      }
      const content = resolved.item;
      content.fileUrl = resolved.fileUrl;
      const isOA = ["OpenAccess", "Free"].includes(resolved.accessType || "");
      if (!isAdmin && resolved.kind === "content" && !isOA) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        const hasAccess = checkContentAccess(content, req.user.role, activeSubs);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied." });
        }
      }
      if (content.fileUrl.startsWith("/")) {
        const localPath = import_path2.default.join(process.cwd(), "public", content.fileUrl);
        if (import_fs2.default.existsSync(localPath)) {
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader("Content-Disposition", "inline");
          res.setHeader("Cache-Control", "private, max-age=3600");
          res.setHeader("X-Content-Type-Options", "nosniff");
          return res.sendFile(localPath);
        } else {
          console.warn(`[proxy-pdf] Auto-flagging missing local file: ${content.fileUrl}`);
          if (resolved.kind === "content") {
            await prisma2.content.update({
              where: { id: contentId },
              data: { status: "Draft", validationStatus: "FLAGGED_CONTENT", isViewable: false, flaggedReason: "Local file missing (404)" }
            });
          }
          return res.status(404).json({ error: "Local file not found" });
        }
      }
      const nodeFetch = (await Promise.resolve().then(() => (init_src(), src_exports))).default;
      const proxyHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/pdf,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0"
      };
      if (req.headers["range"]) {
        proxyHeaders["Range"] = req.headers["range"];
      }
      const controller = new AbortController();
      req.on("close", () => controller.abort());
      const upstreamRes = await nodeFetch(content.fileUrl, {
        headers: proxyHeaders,
        redirect: "follow",
        signal: controller.signal
      }).catch((err) => {
        if (err.name === "AbortError") return null;
        throw err;
      });
      if (!upstreamRes) return;
      if (!upstreamRes.ok) {
        console.error(`[proxy-pdf] Upstream failed with ${upstreamRes.status} for ${content.fileUrl}`);
        if (upstreamRes.status === 403 || upstreamRes.status === 404 || upstreamRes.status >= 500) {
          await prisma2.content.update({
            where: { id: contentId },
            data: { status: "Draft", validationStatus: "FLAGGED_CONTENT", isViewable: false, flaggedReason: `Upstream failed with ${upstreamRes.status}` }
          });
        }
        if (!res.headersSent) res.status(upstreamRes.status).json({ error: `Upstream returned ${upstreamRes.status}` });
        return;
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (upstreamRes.headers.get("content-length")) {
        res.setHeader("Content-Length", upstreamRes.headers.get("content-length"));
      }
      if (upstreamRes.headers.get("content-range")) {
        res.setHeader("Content-Range", upstreamRes.headers.get("content-range"));
        res.status(206);
      }
      upstreamRes.body.pipe(res);
    } catch (error) {
      console.error("[proxy-pdf] unexpected error:", error);
      res.status(500).json({ error: "PDF proxy failed" });
    }
  });
  app.get("/api/content/:id/proxy-frame", authenticateJWT, async (req, res) => {
    try {
      const contentId = req.params.id;
      const isAdmin = req.user.role === "SuperAdmin" || req.user.role === "Admin";
      const whereClause = { id: contentId };
      if (!isAdmin) {
        whereClause.status = { not: "Draft" };
      }
      const content = await prisma2.content.findFirst({ where: whereClause });
      if (!content || !content.fileUrl) {
        return res.status(404).json({ error: "Content not found" });
      }
      if (!isAdmin) {
        const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
        const hasAccess = checkContentAccess(content, req.user.role, activeSubs);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied." });
        }
      }
      if (content.fileUrl.startsWith("/")) {
        const filePath = import_path2.default.join(process.cwd(), "dist", content.fileUrl);
        if (!import_fs2.default.existsSync(filePath)) {
          console.warn(`[proxy-frame] Auto-flagging missing local file: ${content.fileUrl}`);
          await prisma2.content.update({
            where: { id: contentId },
            data: { status: "Draft", validationStatus: "FLAGGED_CONTENT", isViewable: false, flaggedReason: "Local file missing (404)" }
          });
          return res.status(404).json({ error: "File not found" });
        }
        return res.redirect(content.fileUrl);
      }
      const nodeFetch = (await Promise.resolve().then(() => (init_src(), src_exports))).default;
      const controller = new AbortController();
      req.on("close", () => controller.abort());
      const upstreamRes = await nodeFetch(content.fileUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "max-age=0"
        },
        redirect: "follow",
        signal: controller.signal
      }).catch((err) => {
        if (err.name === "AbortError") return null;
        throw err;
      });
      if (!upstreamRes) return;
      if (!upstreamRes.ok && (upstreamRes.status === 403 || upstreamRes.status === 404 || upstreamRes.status >= 500)) {
        await prisma2.content.update({
          where: { id: contentId },
          data: { status: "Draft", validationStatus: "FLAGGED_CONTENT", isViewable: false, flaggedReason: `Upstream failed with ${upstreamRes.status}` }
        });
      }
      const contentType = upstreamRes.headers.get("content-type") || "";
      upstreamRes.headers.forEach((value, key) => {
        const lowerKey = key.toLowerCase();
        if (!["x-frame-options", "content-security-policy", "content-security-policy-report-only", "cross-origin-opener-policy", "cross-origin-resource-policy", "cross-origin-embedder-policy"].includes(lowerKey)) {
          res.setHeader(key, value);
        }
      });
      res.status(upstreamRes.status);
      if (contentType.includes("text/html")) {
        let html = await upstreamRes.text();
        const baseUrl = new URL(upstreamRes.url).origin;
        html = html.replace(/<head[^>]*>/i, `$&<base href="${baseUrl}/">`);
        return res.send(html);
      } else {
        upstreamRes.body.pipe(res);
      }
    } catch (error) {
      console.error("[proxy-frame] unexpected error:", error);
      res.status(500).send("Frame proxy failed");
    }
  });
  app.get("/api/user/quotations", authenticateJWT, async (req, res) => {
    try {
      const quotations = await prisma2.quotation.findMany({
        where: { userEmail: req.user.email },
        orderBy: { createdAt: "desc" }
      });
      res.json(quotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quotations" });
    }
  });
  app.get("/api/user/invoices", authenticateJWT, async (req, res) => {
    try {
      const payments = await prisma2.payment.findMany({
        where: { userId: req.user.uid },
        orderBy: { createdAt: "desc" }
      });
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to load invoices" });
    }
  });
  app.put("/api/user/profile", authenticateJWT, async (req, res) => {
    try {
      const { displayName, password, clearFirstLogin } = req.body;
      const dataToUpdate = {};
      if (displayName) dataToUpdate.displayName = displayName;
      if (password) {
        dataToUpdate.password = await import_bcryptjs.default.hash(password, 10);
      }
      if (clearFirstLogin || password) {
        dataToUpdate.isFirstLogin = false;
      }
      const updatedUser = await prisma2.user.update({
        where: { id: req.user.uid },
        data: dataToUpdate
      });
      const { password: _, ...profile } = updatedUser;
      res.json({ message: "Profile updated successfully", user: profile });
    } catch (error) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  app.delete("/api/user/account", authenticateJWT, async (req, res) => {
    try {
      await prisma2.user.delete({
        where: { id: req.user.uid }
      });
      res.json({ message: "Account deleted successfully" });
    } catch (error) {
      console.error("Failed to delete account", error);
      res.status(500).json({ error: "Failed to delete account" });
    }
  });
  const generatePassword = (length = 12) => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    return Array.from(import_crypto2.default.randomBytes(length)).map((b) => chars[b % chars.length]).join("");
  };
  const sendCredentialsEmail = async (to, name, password, extra) => {
    const siteUrl = process.env.SITE_URL || "https://journalslibrary.com";
    const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
    try {
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to,
        subject: "Your STM Digital Library Access Credentials",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>Your STM Digital Library Access Credentials</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F7;padding:30px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,0.10);">

        <!-- TOP ACCENT BAR -->
        <tr><td style="background:linear-gradient(90deg,#1A3A6B 0%,#2563EB 100%);height:6px;font-size:0;">&nbsp;</td></tr>

        <!-- HEADER -->
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #E8EDF4;">
            <img src="https://journalslibrary.com/logo.png" alt="STM Logo" width="60" height="60" style="display:inline-block;margin-bottom:14px;" onerror="this.style.display='none'"/>
            <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#1A3A6B;letter-spacing:-0.3px;">STM Digital Library</h1>
            <p style="margin:0;font-size:12px;color:#6B7A99;font-weight:400;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
          </td>
        </tr>

        <!-- GREETING -->
        <tr>
          <td style="padding:28px 40px 0;">
            <p style="margin:0 0 6px;font-size:13px;color:#2563EB;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;">Greetings from STM Digital Library</p>
            <p style="margin:0 0 14px;font-size:20px;font-weight:700;color:#1A3A6B;">Dear ${name},</p>
            <p style="margin:0 0 10px;font-size:14px;color:#4A5568;line-height:1.7;">
              ${extra?.customMessage || 'We are pleased to inform you that your subscription access has been <span style="color:#16A34A;font-weight:700;">successfully activated</span>.'}
            </p>
            <p style="margin:0;font-size:14px;color:#4A5568;line-height:1.7;">
              You can now log in to the STM Digital Library platform using the credentials provided below.
            </p>
          </td>
        </tr>

        <!-- CREDENTIALS CARD -->
        <tr>
          <td style="padding:24px 40px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0F5FF;border:1px solid #C7D9F8;border-radius:10px;overflow:hidden;">
              <!-- Card Title -->
              <tr>
                <td colspan="2" style="background:#1A3A6B;padding:12px 20px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#FFFFFF;letter-spacing:1px;text-transform:uppercase;">&#128272; Login Credentials</p>
                </td>
              </tr>
              <!-- Login URL -->
              <tr>
                <td style="padding:14px 20px 0;vertical-align:top;width:42%;">
                  <p style="margin:0;font-size:11px;color:#6B7A99;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">&#127760; Login URL</p>
                </td>
                <td style="padding:14px 20px 0;vertical-align:top;">
                  <a href="${siteUrl}/login" style="color:#2563EB;font-size:13px;font-weight:700;text-decoration:none;">${siteUrl}/login</a>
                </td>
              </tr>
              <!-- Divider -->
              <tr><td colspan="2" style="padding:10px 20px 0;"><div style="height:1px;background:#D1DFF8;"></div></td></tr>
              <!-- Username -->
              <tr>
                <td style="padding:12px 20px 0;vertical-align:top;">
                  <p style="margin:0;font-size:11px;color:#6B7A99;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">&#128100; Username</p>
                </td>
                <td style="padding:12px 20px 0;vertical-align:top;">
                  <p style="margin:0;font-size:13px;font-weight:700;color:#1A3A6B;">${to}</p>
                </td>
              </tr>
              <!-- Divider -->
              <tr><td colspan="2" style="padding:10px 20px 0;"><div style="height:1px;background:#D1DFF8;"></div></td></tr>
              <!-- Password -->
              <tr>
                <td style="padding:12px 20px 18px;vertical-align:middle;">
                  <p style="margin:0;font-size:11px;color:#6B7A99;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">&#128273; Temporary Password</p>
                </td>
                <td style="padding:12px 20px 18px;vertical-align:middle;">
                  <span style="display:inline-block;background:#1A3A6B;color:#60C2F8;font-family:'Courier New',monospace;font-size:15px;font-weight:700;letter-spacing:2px;padding:7px 16px;border-radius:6px;">${password}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- SECURITY NOTICE -->
        <tr>
          <td style="padding:0 40px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FCD34D;border-left:4px solid #F59E0B;border-radius:8px;">
              <tr>
                <td style="padding:14px 18px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400E;">&#9888;&#65039; Important Security Instructions</p>
                  <p style="margin:0 0 4px;font-size:12px;color:#78350F;line-height:1.7;">For security purposes:</p>
                  <table role="presentation" cellpadding="0" cellspacing="0">
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; This is a <strong>temporary password</strong></td></tr>
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; You will be prompted to <strong>change your password</strong> after first login</td></tr>
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; Please keep your login credentials <strong>confidential</strong></td></tr>
                    <tr><td style="padding:2px 0;font-size:12px;color:#78350F;">&#8226;&nbsp; Do not share access outside your institution/organization</td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        ${extra && (extra.institution || extra.department || extra.planName || extra.validity) ? `
        <!-- SUBSCRIPTION DETAILS -->
        <tr>
          <td style="padding:0 40px 22px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:10px;overflow:hidden;">
              <tr>
                <td colspan="2" style="background:#1A3A6B;padding:12px 20px;">
                  <p style="margin:0;font-size:12px;font-weight:700;color:#FFFFFF;letter-spacing:1px;text-transform:uppercase;">&#128218; Subscription Details</p>
                </td>
              </tr>
              ${extra.institution ? `<tr style="border-bottom:1px solid #EEF2F7;">
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;width:48%;">Institution / Organization</td>
                <td style="padding:11px 20px;font-size:13px;color:#1A3A6B;font-weight:700;">${extra.institution}</td>
              </tr>` : ""}
              ${extra.department ? `<tr style="border-bottom:1px solid #EEF2F7;">
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;">Department Access</td>
                <td style="padding:11px 20px;font-size:13px;color:#1A3A6B;font-weight:700;">${extra.department}</td>
              </tr>` : ""}
              ${extra.planName ? `<tr style="border-bottom:1px solid #EEF2F7;">
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;">Subscription Plan</td>
                <td style="padding:11px 20px;font-size:13px;color:#1A3A6B;font-weight:700;">${extra.planName}</td>
              </tr>` : ""}
              ${extra.validity ? `<tr>
                <td style="padding:11px 20px;font-size:12px;color:#6B7A99;font-weight:600;">Validity</td>
                <td style="padding:11px 20px;font-size:13px;color:#16A34A;font-weight:700;">${extra.validity}</td>
              </tr>` : ""}
            </table>
          </td>
        </tr>` : ""}

        <!-- SUPPORT -->
        <tr>
          <td style="padding:0 40px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:10px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1E40AF;">&#128295; Need Assistance?</p>
                  <p style="margin:0 0 10px;font-size:12px;color:#3B5FBF;line-height:1.6;">If you face any issues related to login, access, or subscription, please contact us:</p>
                  <p style="margin:0 0 4px;font-size:13px;color:#1E40AF;">&#128231;&nbsp;<a href="mailto:info@celnet.in" style="color:#2563EB;font-weight:700;text-decoration:none;">info@celnet.in</a></p>
                  <p style="margin:0;font-size:13px;color:#1E40AF;">&#128222;&nbsp;<a href="tel:+919810078958" style="color:#2563EB;font-weight:700;text-decoration:none;">+91-9810078958</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#1A3A6B;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#FCD34D;letter-spacing:0.5px;text-transform:uppercase;">&#127942; 21 Years of Trusted Excellence in Education &amp; Academic Publishing</p>
            <p style="margin:0 0 4px;font-size:13px;color:#CBD5E1;">Regards,</p>
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#FFFFFF;">STM Digital Library Team</p>
            <p style="margin:0 0 16px;font-size:12px;color:#94A3B8;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
            <div style="height:1px;background:#2D5299;margin-bottom:14px;"></div>
            <p style="margin:0;font-size:11px;color:#64748B;">
              &copy; ${(/* @__PURE__ */ new Date()).getFullYear()} STM Digital Library. All rights reserved.&nbsp;|&nbsp;
              <a href="${siteUrl}/privacy-policy" style="color:#93C5FD;text-decoration:none;">Privacy Policy</a>&nbsp;|&nbsp;
              <a href="${siteUrl}/terms-and-conditions" style="color:#93C5FD;text-decoration:none;">Terms &amp; Conditions</a>
            </p>
          </td>
        </tr>

        <!-- BOTTOM ACCENT BAR -->
        <tr><td style="background:linear-gradient(90deg,#2563EB 0%,#1A3A6B 100%);height:4px;font-size:0;">&nbsp;</td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
      });
    } catch (emailErr) {
      console.error("Credentials email failed for:", to);
      console.error("Error details:", emailErr.message || emailErr);
      if (emailErr.stack) console.error(emailErr.stack);
    }
  };
  const sendPaymentSuccessEmails = async (userEmail, userName, totalAmount, items, paymentId, orderId, invoiceNumber, pdfBase64) => {
    const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
    const adminEmail = process.env.ADMIN_EMAIL || "info@celnet.in";
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    const itemsHtml = Array.isArray(items) ? items.map((item) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:600;">${item.domainName || item.description || "Subscription"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">${item.planName || "\u2014"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">${item.duration || "Monthly"}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;font-weight:700;text-align:right;">\u20B9${Number(item.price || item.unitPrice || 0).toLocaleString("en-IN")}</td>
      </tr>`).join("") : '<tr><td colspan="4" style="padding:12px;text-align:center;color:#94a3b8;">No items</td></tr>';
    const customerHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:32px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:620px;">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:32px 48px 28px;text-align:center;">
    <h1 style="color:#ffffff;margin:0 0 4px;font-size:24px;font-weight:900;letter-spacing:1px;">STM DIGITAL LIBRARY</h1>
    <p style="color:#93c5fd;margin:0 0 16px;font-size:12px;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
    <span style="display:inline-block;background:#15803d;color:#ffffff;font-size:11px;font-weight:700;border-radius:30px;padding:6px 20px;">\u2705 &nbsp;Payment Confirmed</span>
  </td></tr>
  <!-- Success Banner -->
  <tr><td style="background:#f0fdf4;border-bottom:2px solid #bbf7d0;padding:22px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-size:28px;">\u2705</td>
      <td style="padding-left:14px;">
        <p style="margin:0;font-size:17px;font-weight:800;color:#15803d;">Payment Successful!</p>
        <p style="margin:4px 0 0;font-size:13px;color:#166534;">Thank you, ${userName}. Your subscription is now active.</p>
      </td>
      <td style="text-align:right;">
        <p style="margin:0;font-size:26px;font-weight:900;color:#15803d;">\u20B9${totalAmount}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">incl. 18% GST</p>
      </td>
    </tr></table>
  </td></tr>
  <!-- Invoice Details -->
  <tr><td style="padding:28px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);border-radius:12px;">
    <tr><td style="padding:18px 24px;">
      <p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">\u{1F4C4} &nbsp;Invoice Details</p>
      <table width="100%" cellpadding="0" cellspacing="0"><tbody>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);width:50%;">Invoice Number</td>
          <td style="color:#fff;font-size:13px;font-weight:700;text-align:right;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Payment ID</td>
          <td style="color:#fff;font-size:12px;font-weight:600;text-align:right;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-family:monospace;">${paymentId || "\u2014"}</td>
        </tr>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Order ID</td>
          <td style="color:#fff;font-size:12px;font-weight:600;text-align:right;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-family:monospace;">${orderId || "\u2014"}</td>
        </tr>
        <tr>
          <td style="color:#93c5fd;font-size:12px;padding:5px 0;">Date</td>
          <td style="color:#fff;font-size:13px;font-weight:600;text-align:right;padding:5px 0;">${(/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</td>
        </tr>
      </tbody></table>
    </td></tr></table>
  </td></tr>
  <!-- Items Table -->
  <tr><td style="padding:24px 48px 0;">
    <p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:2px;margin:0 0 10px;">\u{1F6D2} Items Purchased</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <thead><tr style="background:#f8fafc;">
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:left;border-bottom:1px solid #e2e8f0;">Domain / Subject</th>
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">Plan</th>
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:center;border-bottom:1px solid #e2e8f0;">Duration</th>
        <th style="padding:10px 14px;font-size:11px;font-weight:700;color:#64748b;text-align:right;border-bottom:1px solid #e2e8f0;">Price</th>
      </tr></thead>
      <tbody>${itemsHtml}</tbody>
      <tfoot><tr style="background:#1e293b;">
        <td colspan="3" style="padding:12px 14px;font-size:12px;font-weight:700;color:#94a3b8;">Total (incl. 18% GST)</td>
        <td style="padding:12px 14px;font-size:15px;font-weight:900;color:#ffffff;text-align:right;">\u20B9${totalAmount}</td>
      </tr></tfoot>
    </table>
  </td></tr>
  <!-- Access Info -->
  <tr><td style="padding:24px 48px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;">
    <tr><td style="padding:18px 22px;">
      <p style="color:#92400e;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">\u{1F510} Access Your Subscription</p>
      <p style="color:#78350f;font-size:13px;margin:0 0 8px;">Log in to your dashboard to start reading:</p>
      <a href="https://journalslibrary.com/dashboard" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:13px;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;">Go to My Dashboard \u2192</a>
    </td></tr></table>
  </td></tr>
  <!-- Contact -->
  <tr><td style="padding:24px 48px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;">
    <tr><td style="padding:16px 22px;">
      <p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">\u{1F4DE} Need Help?</p>
      <p style="margin:2px 0;font-size:13px;color:#1e293b;">\u{1F4E7} <a href="mailto:info@celnet.in" style="color:#2563eb;text-decoration:none;font-weight:600;">info@celnet.in</a></p>
      <p style="margin:2px 0;font-size:13px;color:#1e293b;">\u{1F4DE} +91-9810078958</p>
    </td></tr></table>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:24px 48px;text-align:center;">
    <p style="color:#f8fafc;font-size:12px;margin:0 0 4px;font-weight:700;">STM Digital Library \u2014 21 Years of Trusted Excellence</p>
    <p style="color:#64748b;font-size:11px;margin:0;">\xA9 ${year} Consortium eLearning Network Pvt. Ltd. All rights reserved.</p>
    <p style="color:#475569;font-size:10px;margin:4px 0 0;">GSTIN: 09AACCC6494M1Z1 &nbsp;|&nbsp; PAN: AACCC6494M</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
    const adminHtml = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <div style="background:#0f172a;padding:20px 28px;">
    <h2 style="color:#fff;margin:0;font-size:18px;">\u{1F514} New Payment Received</h2>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:13px;">STM Digital Library \u2014 Admin Notification</p>
  </div>
  <div style="padding:24px 28px;border-bottom:1px solid #e2e8f0;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Customer</td><td style="font-size:13px;font-weight:700;color:#1e293b;text-align:right;">${userName} &lt;${userEmail}&gt;</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Invoice No</td><td style="font-size:13px;font-weight:700;color:#1e293b;text-align:right;">${invoiceNumber}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Payment ID</td><td style="font-size:12px;font-family:monospace;color:#1e293b;text-align:right;">${paymentId || "\u2014"}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Order ID</td><td style="font-size:12px;font-family:monospace;color:#1e293b;text-align:right;">${orderId || "\u2014"}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Amount</td><td style="font-size:18px;font-weight:900;color:#15803d;text-align:right;">\u20B9${totalAmount}</td></tr>
      <tr><td style="font-size:12px;color:#94a3b8;padding:4px 0;">Date</td><td style="font-size:13px;font-weight:600;color:#1e293b;text-align:right;">${(/* @__PURE__ */ new Date()).toLocaleString("en-IN")}</td></tr>
    </table>
  </div>
  <div style="padding:16px 28px;background:#f8fafc;">
    <p style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1.5px;margin:0 0 8px;">Items</p>
    ${Array.isArray(items) ? items.map((item) => `<p style="margin:4px 0;font-size:13px;color:#1e293b;"><strong>${item.domainName || item.description}</strong> \u2014 ${item.planName || ""} | ${item.duration || "Monthly"} | <strong>\u20B9${Number(item.price || item.unitPrice || 0).toLocaleString("en-IN")}</strong></p>`).join("") : ""}
  </div>
  <div style="padding:16px 28px;text-align:center;">
    <a href="https://journalslibrary.com/admin/payments" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:13px;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;">View in Admin Dashboard \u2192</a>
  </div>
</div>
</body></html>`;
    try {
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to: userEmail,
        subject: `Payment Confirmation \u2014 Invoice ${invoiceNumber} | STM Digital Library`,
        html: customerHtml,
        attachments: pdfBase64 ? [{ filename: `Invoice_${invoiceNumber}.pdf`, content: pdfBase64, encoding: "base64" }] : []
      });
      await sendMail({
        from: `"STM Payments Alert" <${emailFrom}>`,
        to: adminEmail,
        subject: `[New Payment] \u20B9${totalAmount} from ${userName} \u2014 ${invoiceNumber}`,
        html: adminHtml
      });
      return true;
    } catch (err) {
      console.error("Payment Confirmation Emails Failed:", err);
      return false;
    }
  };
  app.get("/api/admin/users", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { role: filterRole, search } = req.query;
      const where = {};
      if (filterRole && filterRole !== "all") where.role = filterRole;
      if (search) {
        where.OR = [
          { email: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } }
        ];
      }
      const users = await prisma2.user.findMany({
        where,
        include: {
          subscriptions: { where: { status: "Active" }, take: 3 },
          payments: { orderBy: { createdAt: "desc" }, take: 3 },
          institution: {
            include: {
              subscriptions: {
                where: { status: "Active" },
                orderBy: { createdAt: "desc" },
                take: 5
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      const verifications = await prisma2.emailVerification.findMany();
      const verifiedEmails = new Set(verifications.filter((v) => v.isVerified).map((v) => v.email));
      const sanitized = users.map(({ password: _, ...u }) => ({
        ...u,
        isEmailVerified: verifiedEmails.has(u.email)
      }));
      res.json(sanitized);
    } catch (err) {
      console.error("GET /api/admin/users error:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  app.get("/api/admin/institutions", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const institutions = await prisma2.institution.findMany({
        select: { id: true, name: true, status: true },
        orderBy: { name: "asc" }
      });
      res.json(Array.isArray(institutions) ? institutions : []);
    } catch (err) {
      res.json([]);
    }
  });
  app.post("/api/admin/users/create", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { name, email, role, institutionId, institutionName, sendEmail, customPassword, isDemoAccount } = req.body;
      if (!name || !email || !role) {
        return res.status(400).json({ error: "Name, email and role are required" });
      }
      if (role === "Institution" && !institutionName) {
        return res.status(400).json({ error: "Institution Name is required for Institution role" });
      }
      const existing = await prisma2.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });
      const plainPassword = customPassword || generatePassword();
      const hashedPassword = await import_bcryptjs.default.hash(plainPassword, 10);
      let newInstId = null;
      if (role === "Institution") {
        const newInst = await prisma2.institution.create({
          data: {
            name: institutionName,
            status: "Active"
          }
        });
        newInstId = newInst.id;
      }
      const newUser = await prisma2.user.create({
        data: {
          email,
          password: hashedPassword,
          displayName: name,
          role,
          status: "Active",
          isFirstLogin: true,
          organization: institutionName || void 0,
          institutionId: newInstId || institutionId || void 0,
          isDemoAccount: Boolean(isDemoAccount),
          demoExpiresAt: isDemoAccount ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3) : null
        }
      });
      await prisma2.usageLog.create({
        data: {
          action: "USER_CREATED",
          details: `User ${email} created with role ${role} by ${req.user.email}`,
          userId: req.user.uid
        }
      });
      if (sendEmail !== false) {
        await sendCredentialsEmail(email, name, plainPassword);
      }
      const { password: _, ...profile } = newUser;
      res.json({
        user: profile,
        credentials: { email, password: plainPassword }
        // returned once for admin to copy
      });
    } catch (err) {
      console.error("Create user error:", err);
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  app.put("/api/admin/users/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { displayName, email, role, organization, contact, designation, branch, department } = req.body;
      if (role === "SuperAdmin" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Only SuperAdmins can assign the SuperAdmin role" });
      }
      const existing = await prisma2.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      if (email && email !== existing.email) {
        const taken = await prisma2.user.findUnique({ where: { email } });
        if (taken) return res.status(409).json({ error: "Email already in use" });
      }
      let newInstitutionProfile = existing.institutionProfile || {};
      if (branch !== void 0) newInstitutionProfile.branch = branch;
      if (department !== void 0) newInstitutionProfile.department = department;
      const updated = await prisma2.user.update({
        where: { id },
        data: {
          ...displayName ? { displayName } : {},
          ...email ? { email } : {},
          ...role ? { role } : {},
          ...organization !== void 0 ? { organization } : {},
          ...contact !== void 0 ? { contact } : {},
          ...designation !== void 0 ? { designation } : {},
          institutionProfile: newInstitutionProfile
        }
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      console.error("PUT /api/admin/users/:id error:", err);
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  app.put("/api/admin/users/:id/role", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { role } = req.body;
      const { id } = req.params;
      const allowedRoles = ["SuperAdmin", "SubscriptionManager", "Institution", "Student", "Subscriber"];
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role value" });
      }
      if (role === "SuperAdmin" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Only SuperAdmins can assign the SuperAdmin role" });
      }
      const prevUser = await prisma2.user.findUnique({ where: { id } });
      if (!prevUser) return res.status(404).json({ error: "User not found" });
      const updated = await prisma2.user.update({ where: { id }, data: { role } });
      await prisma2.usageLog.create({
        data: {
          action: "ROLE_CHANGE",
          details: `Role changed from ${prevUser.role} \u2192 ${role} for user ${prevUser.email} by ${req.user.email}`,
          userId: req.user.uid
        }
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      res.status(500).json({ error: "Failed to update role" });
    }
  });
  app.post("/api/admin/users/:id/reset-password", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const targetUser = await prisma2.user.findUnique({ where: { id } });
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      const newPlain = generatePassword();
      const hashed = await import_bcryptjs.default.hash(newPlain, 10);
      await prisma2.user.update({
        where: { id },
        data: { password: hashed, isFirstLogin: true }
      });
      await sendCredentialsEmail(targetUser.email, targetUser.displayName || "User", newPlain);
      await prisma2.usageLog.create({
        data: {
          action: "PASSWORD_RESET",
          details: `Password reset for ${targetUser.email} by ${req.user.email}`,
          userId: req.user.uid
        }
      });
      res.json({ message: "Password reset and emailed successfully", password: newPlain });
    } catch (err) {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  app.delete("/api/admin/users/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      if (id === req.user.uid) return res.status(400).json({ error: "Cannot delete your own account" });
      await prisma2.$transaction([
        prisma2.payment.deleteMany({ where: { userId: id } }),
        prisma2.subscription.deleteMany({ where: { userId: id } }),
        prisma2.subscriptionRequest.deleteMany({ where: { userId: id } }),
        prisma2.quotation.deleteMany({ where: { userId: id } }),
        prisma2.submission.deleteMany({ where: { userId: id } }),
        prisma2.usageLog.deleteMany({ where: { userId: id } }),
        prisma2.studentActivity.deleteMany({ where: { userId: id } }),
        prisma2.couponUsage.deleteMany({ where: { userId: id } }),
        prisma2.favorite.deleteMany({ where: { userId: id } }),
        prisma2.user.delete({ where: { id } })
      ]);
      res.json({ message: "User deleted" });
    } catch (err) {
      console.error("Delete user error:", err);
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  const GST_RATE = 0.18;
  const COMPANY_STATE = "Delhi";
  const USER_TYPES = [
    "General",
    "Student Scholar",
    "College Excellence",
    "University Global",
    "Corporate Innovator"
  ];
  async function syncContentModuleCounts() {
    const groups = await prisma2.content.groupBy({
      by: ["domain", "contentType"],
      where: { status: { in: ["Published", "published"] }, domain: { not: null } },
      _count: { id: true }
    });
    for (const g of groups) {
      if (!g.domain) continue;
      for (const userType of USER_TYPES) {
        await prisma2.contentModule.upsert({
          where: { domain_contentType_userType: { domain: g.domain, contentType: g.contentType, userType } },
          create: { domain: g.domain, contentType: g.contentType, userType, totalCount: g._count.id },
          update: { totalCount: g._count.id }
        });
      }
    }
  }
  app.get("/api/content-modules", async (req, res) => {
    try {
      const { domain, userType } = req.query;
      const where = { isActive: true };
      if (domain) where.domain = domain;
      where.userType = userType ? userType : "General";
      const modules = await prisma2.contentModule.findMany({
        where,
        orderBy: [{ domain: "asc" }, { contentType: "asc" }]
      });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content modules" });
    }
  });
  app.post("/api/content-modules/calculate", async (req, res) => {
    try {
      const { moduleIds, planType, userState, userType } = req.body;
      if (!Array.isArray(moduleIds) || moduleIds.length === 0) {
        return res.json({ subtotal: 0, gstAmount: 0, total: 0, breakdown: [], planType });
      }
      const modules = await prisma2.contentModule.findMany({
        where: { id: { in: moduleIds }, isActive: true }
      });
      const breakdown = modules.map((m2) => {
        let price = 0;
        if (planType === "Monthly") price = m2.monthlyPrice;
        else if (planType === "Quarterly") price = m2.quarterlyPrice;
        else if (planType === "Half-Yearly") price = m2.halfYearlyPrice;
        else if (planType === "Yearly") price = m2.yearlyPrice;
        return {
          id: m2.id,
          domain: m2.domain,
          contentType: m2.contentType,
          price,
          totalCount: m2.totalCount,
          planType,
          userType: m2.userType
        };
      });
      const subtotal = breakdown.reduce((sum, b) => sum + b.price, 0);
      const isInterState = userState && userState.toLowerCase() !== COMPANY_STATE.toLowerCase();
      const gstAmount = parseFloat((subtotal * GST_RATE).toFixed(2));
      const total = parseFloat((subtotal + gstAmount).toFixed(2));
      res.json({
        breakdown,
        subtotal,
        gstAmount,
        total,
        planType,
        userType,
        gstType: isInterState ? "IGST" : "CGST+SGST",
        gstRate: GST_RATE
      });
    } catch (error) {
      console.error("Calculate error:", error);
      res.status(500).json({ error: "Calculation failed" });
    }
  });
  app.get("/api/admin/content-modules", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await syncContentModuleCounts();
      const { userType } = req.query;
      const where = {};
      if (userType && userType !== "all") where.userType = userType;
      const modules = await prisma2.contentModule.findMany({
        where,
        orderBy: [{ domain: "asc" }, { userType: "asc" }, { contentType: "asc" }]
      });
      res.json(modules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch modules" });
    }
  });
  app.put("/api/admin/content-modules/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { monthlyPrice, quarterlyPrice, halfYearlyPrice, yearlyPrice, yearlyDiscountPct, isActive, userType } = req.body;
      const data = {};
      if (monthlyPrice !== void 0) data.monthlyPrice = parseFloat(monthlyPrice);
      if (quarterlyPrice !== void 0) data.quarterlyPrice = parseFloat(quarterlyPrice);
      if (halfYearlyPrice !== void 0) data.halfYearlyPrice = parseFloat(halfYearlyPrice);
      if (yearlyPrice !== void 0) data.yearlyPrice = parseFloat(yearlyPrice);
      if (yearlyDiscountPct !== void 0) data.yearlyDiscountPct = parseFloat(yearlyDiscountPct);
      if (isActive !== void 0) data.isActive = isActive;
      if (userType !== void 0) data.userType = userType;
      const updated = await prisma2.contentModule.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update module" });
    }
  });
  app.post("/api/admin/content-modules/sync", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await syncContentModuleCounts();
      const modules = await prisma2.contentModule.findMany({ orderBy: [{ domain: "asc" }, { contentType: "asc" }] });
      res.json({ synced: modules.length, modules });
    } catch (error) {
      res.status(500).json({ error: "Sync failed" });
    }
  });
  app.get("/api/videos/grouped", authenticateJWT, async (req, res) => {
    try {
      const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      const videos = await prisma2.content.findMany({
        where: {
          contentType: "Educational Videos",
          status: { in: ["Published", "published"] }
        }
      });
      const accessibleVideos = videos.filter((v) => checkContentAccess(v, req.user.role, activeSubs));
      const grouped = accessibleVideos.reduce((acc, video) => {
        const d = video.domain || "Other";
        if (!acc[d]) acc[d] = [];
        acc[d].push(video);
        return acc;
      }, {});
      res.json(grouped);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch grouped videos" });
    }
  });
  app.get("/api/videos/:id/details", authenticateJWT, async (req, res) => {
    try {
      const videoId = req.params.id;
      const content = await prisma2.content.findUnique({ where: { id: videoId } });
      if (!content || content.contentType !== "Educational Videos") {
        return res.status(404).json({ error: "Video not found" });
      }
      const activeSubs = await getUserActiveSubscriptions(req.user.uid, req.user.role, req.user.institutionId);
      if (!checkContentAccess(content, req.user.role, activeSubs)) {
        return res.status(403).json({ error: "Access denied." });
      }
      if (["Student", "Subscriber"].includes(req.user.role)) {
        try {
          const existing = await prisma2.studentActivity.findFirst({
            where: { userId: req.user.uid, contentId: content.id }
          });
          if (existing) {
            await prisma2.studentActivity.update({ where: { id: existing.id }, data: { accessedAt: /* @__PURE__ */ new Date() } });
          } else {
            await prisma2.studentActivity.create({ data: { userId: req.user.uid, contentId: content.id, timeSpent: 0, lastPage: 1 } });
          }
        } catch (e2) {
          console.error("Activity log failed (video):", e2);
        }
      }
      let related = [];
      if (content.domain) {
        const allRelated = await prisma2.content.findMany({
          where: {
            contentType: "Educational Videos",
            domain: content.domain,
            status: { in: ["Published", "published"] },
            id: { not: content.id }
          },
          take: 20
        });
        related = allRelated.filter((v) => checkContentAccess(v, req.user.role, activeSubs)).slice(0, 10);
      }
      res.json({
        video: {
          id: content.id,
          title: content.title,
          description: content.description,
          domain: content.domain,
          fileUrl: content.fileUrl
        },
        related
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch video details" });
    }
  });
  app.get("/api/search", async (req, res) => {
    try {
      const { q, domain, contentType, page = "1", limit = "20" } = req.query;
      if (!q || q.trim().length < 2) {
        return res.json({ data: [], total: 0, query: q || "" });
      }
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const where = {
        status: "Published",
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { authors: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { domain: { contains: q, mode: "insensitive" } },
          { contentType: { contains: q, mode: "insensitive" } },
          { subjectArea: { contains: q, mode: "insensitive" } }
        ]
      };
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
      const [data, total] = await Promise.all([
        prisma2.content.findMany({
          where,
          skip,
          take: parseInt(limit),
          orderBy: { publishedAt: "desc" },
          select: {
            id: true,
            title: true,
            authors: true,
            domain: true,
            contentType: true,
            description: true,
            subjectArea: true,
            thumbnailUrl: true,
            accessType: true,
            price: true,
            publishedAt: true
          }
        }),
        prisma2.content.count({ where })
      ]);
      res.json({ data, total, query: q, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
      console.error("GET /api/search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });
  app.get("/api/domain-data", async (req, res) => {
    try {
      const domain = req.query.domain;
      if (!domain) return res.status(400).json({ error: "domain query param required" });
      const contentGroups = await prisma2.content.groupBy({
        by: ["contentType"],
        where: { domain, status: { in: ["Published", "published"] } },
        _count: { id: true },
        orderBy: { contentType: "asc" }
      });
      const content_summary = contentGroups.map((g) => ({
        type: g.contentType,
        count: g._count.id
      }));
      const { userType } = req.query;
      const moduleWhere = { domain, isActive: true };
      if (userType) moduleWhere.userType = userType;
      else moduleWhere.userType = "General";
      const modules = await prisma2.contentModule.findMany({
        where: moduleWhere,
        orderBy: { contentType: "asc" }
      });
      const pricing_modules = modules.map((m2) => ({
        id: m2.id,
        type: m2.contentType,
        userType: m2.userType,
        monthlyPrice: m2.monthlyPrice,
        quarterlyPrice: m2.quarterlyPrice,
        halfYearlyPrice: m2.halfYearlyPrice,
        yearlyPrice: m2.yearlyPrice,
        yearlyDiscountPct: m2.yearlyDiscountPct,
        totalCount: m2.totalCount,
        visible: m2.isActive
      }));
      res.json({ domain, content_summary, pricing_modules, userTypes: USER_TYPES });
    } catch (err) {
      console.error("GET /api/domain-data error:", err);
      res.status(500).json({ error: "Failed to fetch domain data" });
    }
  });
  app.post("/api/domain-request", async (req, res) => {
    try {
      const { userName, email, organization, domain, selectedModules, planType, totalPrice, notes } = req.body;
      if (!userName || !email || !domain) {
        return res.status(400).json({ error: "Name, email and domain are required" });
      }
      const planDesc = `Domain Access Request: ${domain} | Plan: ${planType || "Monthly"} | Modules: ${Array.isArray(selectedModules) ? selectedModules.join(", ") : "All"} | Est. Total: \u20B9${totalPrice || 0}${organization ? ` | Org: ${organization}` : ""}`;
      const request = await prisma2.subscriptionRequest.create({
        data: {
          userName,
          email,
          planType: planType || "Monthly",
          durationMonths: planType === "Yearly" ? 12 : planType === "Quarterly" ? 3 : 1,
          planDescription: planDesc,
          notes: notes || null,
          status: "Pending"
        }
      });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const durationMonths = planType === "Yearly" ? 12 : planType === "Quarterly" ? 3 : 1;
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: `\u{1F525} New Domain Access Lead: ${domain} \u2014 ${userName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F525} New Domain Access Lead</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">A new access request has been submitted for the <strong>${domain}</strong> collection.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">\u{1F4E6} Request Details</p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Domain:</span> <strong style="color:#fff;">${domain}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Notes:</span> <span style="color:#e2e8f0;">${notes || "\u2014"}</span></p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:18px;"><tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Contact Info</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${userName}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Organization</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${organization || "N/A"}</td></tr></table><div style="background:#fefce8;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;"><p style="margin:0;font-size:13px;color:#92400e;">\u{1F3C3} <strong>Hot Lead!</strong> Follow up within 24 hours.</p></div></td></tr>`
        )
      };
      const userMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: email,
        subject: `\u2705 Your Request for ${domain} Access \u2014 Received!`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u2705 Request Received!</p><p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${userName}</strong>, we have received your request for the <strong>${domain}</strong> collection. Our team will contact you shortly to finalize the setup.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">\u{1F4CB} Your Request Summary</p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Domain:</span> <strong style="color:#fff;">${domain}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Organization:</span> <span style="color:#e2e8f0;">${organization || "\u2014"}</span></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Notes:</span> <span style="color:#e2e8f0;">${notes || "\u2014"}</span></p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:18px;"><tr><td style="padding:18px 20px;"><p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F550} What Happens Next?</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">1</span>&nbsp; Our team reviews your request within 24 hrs</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">2</span>&nbsp; We confirm subscription &amp; payment details</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">3</span>&nbsp; Full-text access is activated instantly</p></td></tr></table><p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a> or call <strong>+91-120-4781200</strong></p></td></tr>`
        )
      };
      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);
      res.json({ success: true, requestId: request.id, message: "Your request has been received. We will contact you shortly." });
    } catch (err) {
      console.error("POST /api/domain-request error:", err);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });
  app.get("/api/quotation/next-number", async (_req, res) => {
    try {
      const now = /* @__PURE__ */ new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const prefix = `QTN-${year}-${month}-`;
      const count = await prisma2.quotation.count({
        where: { id: { startsWith: prefix } }
      });
      const seq = String(count + 1).padStart(2, "0");
      res.json({ quotationNumber: `${prefix}${seq}` });
    } catch (error) {
      console.error("Next quotation number error:", error);
      res.status(500).json({ error: "Failed to generate quotation number" });
    }
  });
  app.post("/api/quotations", authenticateJWT, async (req, res) => {
    try {
      const {
        userName,
        userEmail,
        organization,
        state,
        planType,
        moduleIds,
        pricingBreakdown,
        subtotal,
        gstAmount,
        total,
        items,
        allowedDomain,
        notes
      } = req.body;
      const expiresAt = /* @__PURE__ */ new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const quotation = await prisma2.quotation.create({
        data: {
          userName,
          userEmail,
          organization,
          state,
          planType: planType || "Monthly",
          selectedModules: moduleIds || [],
          pricingBreakdown: pricingBreakdown || {},
          items: items || [],
          subtotal: parseFloat(subtotal) || 0,
          gstAmount: parseFloat(gstAmount) || 0,
          total: parseFloat(total) || 0,
          allowedDomain: allowedDomain || null,
          notes: notes || null,
          userId: req.user?.uid || req.user?.id || null,
          expiresAt
        }
      });
      res.json(quotation);
    } catch (error) {
      console.error("Create quotation error:", error);
      res.status(500).json({ error: "Failed to create quotation" });
    }
  });
  app.get("/api/admin/quotations", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { status } = req.query;
      const where = {};
      if (status) where.status = status;
      const quotations = await prisma2.quotation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: true }
      });
      res.json(quotations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch quotations" });
    }
  });
  app.put("/api/admin/quotations/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;
      const data = {};
      if (status) data.status = status;
      if (notes !== void 0) data.notes = notes;
      const updated = await prisma2.quotation.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update quotation" });
    }
  });
  app.post("/api/admin/quotations/:id/convert", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;
      const quotation = await prisma2.quotation.findUnique({ where: { id } });
      if (!quotation) return res.status(404).json({ error: "Quotation not found" });
      if (!quotation.userId) return res.status(400).json({ error: "Quotation has no linked user; assign manually" });
      const breakdown = quotation.pricingBreakdown || {};
      const allowedTypes = Array.isArray(breakdown.breakdown) ? breakdown.breakdown.map((b) => b.contentType) : [];
      const start = startDate ? new Date(startDate) : /* @__PURE__ */ new Date();
      const end = endDate ? new Date(endDate) : (() => {
        const d = new Date(start);
        const months = quotation.planType === "Yearly" ? 12 : quotation.planType === "Quarterly" ? 3 : 1;
        d.setMonth(d.getMonth() + months);
        return d;
      })();
      const sub = await prisma2.subscription.create({
        data: {
          userId: quotation.userId,
          planName: `Custom Package (${quotation.planType})`,
          planType: quotation.planType || "Monthly",
          domainName: quotation.allowedDomain || "All Domains",
          startDate: start,
          endDate: end,
          status: "Active"
        }
      });
      await prisma2.quotation.update({ where: { id }, data: { status: "Paid" } });
      res.json({ subscription: sub, quotation: { ...quotation, status: "Paid" } });
    } catch (error) {
      console.error("Convert quotation error:", error);
      res.status(500).json({ error: "Conversion failed" });
    }
  });
  const generateReceiptNumber = async () => {
    const now = /* @__PURE__ */ new Date();
    const prefix = `RCP-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-`;
    const count = await prisma2.receipt.count({ where: { receiptNumber: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(2, "0")}`;
  };
  app.post("/api/admin/quotations/:id/receipt", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { paymentMethod, paymentRef, paymentDate } = req.body || {};
      const quotation = await prisma2.quotation.findUnique({ where: { id } });
      if (!quotation) return res.status(404).json({ error: "Quotation not found" });
      const existing = await prisma2.receipt.findFirst({ where: { quotationId: id } });
      if (existing) return res.status(409).json({ error: "A receipt already exists for this quotation", receipt: existing });
      const receiptNumber = await generateReceiptNumber();
      const receipt = await prisma2.receipt.create({
        data: {
          receiptNumber,
          quotationId: quotation.id,
          userId: quotation.userId || null,
          userEmail: quotation.userEmail,
          userName: quotation.userName,
          organization: quotation.organization || null,
          state: quotation.state || null,
          address: quotation.address || null,
          pincode: quotation.pincode || null,
          gstNumber: quotation.gstNumber || null,
          mobile: quotation.mobile || null,
          userCategory: quotation.userCategory || null,
          items: quotation.items || [],
          subtotal: quotation.subtotal,
          gstAmount: quotation.gstAmount,
          total: quotation.total,
          discountAmount: quotation.discountAmount || 0,
          couponCode: quotation.couponCode || null,
          planType: quotation.planType || "Monthly",
          allowedDomain: quotation.allowedDomain || null,
          paymentMethod: paymentMethod || "Bank Transfer",
          paymentRef: paymentRef || null,
          paymentDate: paymentDate ? new Date(paymentDate) : /* @__PURE__ */ new Date(),
          createdBy: req.user?.email || req.user?.uid || "Admin"
        }
      });
      await prisma2.quotation.update({ where: { id }, data: { status: "Paid" } });
      res.json(receipt);
    } catch (error) {
      console.error("Create receipt error:", error);
      res.status(500).json({ error: "Failed to create receipt" });
    }
  });
  app.get("/api/admin/receipts", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { search } = req.query;
      const where = {};
      if (search) {
        where.OR = [
          { receiptNumber: { contains: search, mode: "insensitive" } },
          { userName: { contains: search, mode: "insensitive" } },
          { userEmail: { contains: search, mode: "insensitive" } },
          { organization: { contains: search, mode: "insensitive" } }
        ];
      }
      const receipts = await prisma2.receipt.findMany({ where, orderBy: { createdAt: "desc" } });
      res.json(receipts);
    } catch (error) {
      console.error("List receipts error:", error);
      res.status(500).json({ error: "Failed to fetch receipts" });
    }
  });
  app.get("/api/admin/receipts/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const receipt = await prisma2.receipt.findUnique({ where: { id: req.params.id } });
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      res.json(receipt);
    } catch (error) {
      console.error("Get receipt error:", error);
      res.status(500).json({ error: "Failed to fetch receipt" });
    }
  });
  app.post("/api/admin/receipts/:id/send", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { pdfBase64 } = req.body || {};
      if (!pdfBase64) return res.status(400).json({ error: "Missing receipt PDF" });
      const receipt = await prisma2.receipt.findUnique({ where: { id } });
      if (!receipt) return res.status(404).json({ error: "Receipt not found" });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "info@celnet.in").trim();
      const logoPath = import_path2.default.join(process.cwd(), "public", "assets", "stm-logo.png");
      const logoExists = import_fs2.default.existsSync(logoPath);
      const paidOn = new Date(receipt.paymentDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const totalAmount = Number(receipt.total).toLocaleString("en-IN", { minimumFractionDigits: 2 });
      const htmlBody = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Payment Receipt \u2014 STM Digital Library</title></head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f7;padding:32px 0;"><tr><td align="center">
    <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:620px;">
      <tr><td style="background:linear-gradient(135deg,#065f46 0%,#047857 100%);padding:32px 48px 28px;text-align:center;">
        ${logoExists ? `<img src="cid:stm-logo" alt="STM Digital Library" width="96" height="96" style="display:block;margin:0 auto 14px;border-radius:12px;"/>` : ""}
        <h1 style="color:#ffffff;margin:0 0 6px;font-size:24px;font-weight:900;letter-spacing:1px;">PAYMENT RECEIPT</h1>
        <p style="color:#a7f3d0;margin:0;font-size:13px;font-weight:500;">STM Digital Library \u2014 Consortium eLearning Network Pvt. Ltd.</p>
      </td></tr>
      <tr><td style="padding:32px 48px 8px;">
        <p style="font-size:16px;color:#1e293b;margin:0 0 6px;font-weight:600;">Dear ${receipt.userName},</p>
        <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 20px;">
          We gratefully acknowledge the receipt of your payment. Please find your official receipt attached for your records.
        </p>
      </td></tr>
      <tr><td style="padding:0 48px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#047857,#065f46);border-radius:14px;">
          <tr><td style="padding:22px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="color:#a7f3d0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);width:55%;">Receipt Number</td>
                  <td style="color:#ffffff;font-size:13px;font-weight:700;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">${receipt.receiptNumber}</td></tr>
              <tr><td style="color:#a7f3d0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">Payment Date</td>
                  <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">${paidOn}</td></tr>
              <tr><td style="color:#a7f3d0;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">Payment Method</td>
                  <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.15);">${receipt.paymentMethod}${receipt.paymentRef ? ` (${receipt.paymentRef})` : ""}</td></tr>
              <tr><td style="color:#a7f3d0;font-size:13px;font-weight:600;padding-top:14px;">Amount Paid (Incl. 18% GST)</td>
                  <td style="text-align:right;padding-top:14px;"><span style="color:#ffffff;font-size:22px;font-weight:900;">\u20B9${totalAmount}</span></td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 48px 36px;">
        <p style="font-size:13px;color:#64748b;line-height:1.7;margin:0;">This is a computer-generated receipt. For any queries, contact us at ${process.env.ADMIN_EMAIL || "info@celnet.in"}.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
      const attachments = [
        { filename: `Receipt_${receipt.receiptNumber}.pdf`, content: pdfBase64, encoding: "base64" }
      ];
      if (logoExists) attachments.push({ filename: "stm-logo.png", path: logoPath, cid: "stm-logo" });
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to: [receipt.userEmail, process.env.ADMIN_EMAIL || "info@celnet.in"],
        subject: `Payment Receipt ${receipt.receiptNumber} \u2014 STM Digital Library`,
        html: htmlBody,
        attachments
      });
      const updated = await prisma2.receipt.update({ where: { id }, data: { emailSentAt: /* @__PURE__ */ new Date() } });
      res.json({ status: "success", receipt: updated });
    } catch (error) {
      console.error("Send receipt error:", error);
      if (!res.headersSent) res.status(500).json({ error: "Failed to send receipt" });
    }
  });
  function mapArticleInput(b, publisher, status, createdBy, ownershipSource = "PublisherSubmitted") {
    return {
      title: b.title || "Untitled",
      authors: b.authors || null,
      abstract: b.abstract || null,
      doi: b.doi || null,
      pdfUrl: b.pdfUrl || null,
      journalName: b.journalName || null,
      journalIssn: b.journalIssn || b.issn || null,
      publisherId: publisher.id,
      publisherName: publisher.name,
      volume: b.volume ? String(b.volume) : null,
      issue: b.issue ? String(b.issue) : null,
      year: b.year ? parseInt(b.year) : null,
      pages: b.pages || null,
      domain: b.domain || null,
      subject: b.subject || null,
      language: b.language || null,
      country: b.country || publisher.country || null,
      accessType: b.accessType || "OpenAccess",
      status,
      source: b.source || "Manual",
      ownershipSource,
      uploadId: b.uploadId || null,
      createdBy
    };
  }
  function mapBookInput(b, publisher, status, createdBy, ownershipSource = "PublisherSubmitted") {
    return {
      title: b.title || "Untitled",
      authors: b.authors || null,
      publisherId: publisher.id,
      publisherName: publisher.name,
      isbn: b.isbn || null,
      doi: b.doi || null,
      year: b.year ? parseInt(b.year) : null,
      subject: b.subject || null,
      domain: b.domain || null,
      language: b.language || null,
      country: b.country || publisher.country || null,
      description: b.description || null,
      coverUrl: b.coverUrl || null,
      pdfUrl: b.pdfUrl || null,
      accessType: b.accessType || "OpenAccess",
      status,
      source: b.source || "Manual",
      ownershipSource,
      uploadId: b.uploadId || null,
      createdBy
    };
  }
  const getPublisherCounts = async (publisherId, facing = false) => {
    const base = { publisherId };
    if (facing) base.ownershipSource = { not: "Ingested" };
    const [articles, books, articlesPublished, articlesPending, articlesRejected, artReads, bookReads] = await Promise.all([
      prisma2.article.count({ where: { ...base } }),
      prisma2.book.count({ where: { ...base } }),
      prisma2.article.count({ where: { ...base, status: "Published" } }),
      prisma2.article.count({ where: { ...base, status: "Draft" } }),
      prisma2.article.count({ where: { ...base, status: "Rejected" } }),
      prisma2.article.aggregate({ where: { ...base }, _sum: { views: true } }),
      prisma2.book.aggregate({ where: { ...base }, _sum: { views: true } })
    ]);
    const totalReads = (artReads._sum.views || 0) + (bookReads._sum.views || 0);
    return { articles, books, articlesPublished, articlesPending, articlesRejected, totalReads };
  };
  const emptyPublisherCounts = () => ({ articles: 0, books: 0, articlesPublished: 0, articlesPending: 0, articlesRejected: 0, totalReads: 0 });
  const getPublisherCountsMap = async () => {
    const map = {};
    const at = (id) => map[id] ||= emptyPublisherCounts();
    const [artGroups, bookGroups] = await Promise.all([
      prisma2.article.groupBy({ by: ["publisherId", "status"], _count: { _all: true }, _sum: { views: true } }),
      prisma2.book.groupBy({ by: ["publisherId"], _count: { _all: true }, _sum: { views: true } })
    ]);
    for (const g of artGroups) {
      if (!g.publisherId) continue;
      const c = at(g.publisherId);
      const n = g._count._all;
      c.articles += n;
      c.totalReads += g._sum?.views || 0;
      if (g.status === "Published") c.articlesPublished += n;
      else if (g.status === "Draft") c.articlesPending += n;
      else if (g.status === "Rejected") c.articlesRejected += n;
    }
    for (const g of bookGroups) {
      if (!g.publisherId) continue;
      const c = at(g.publisherId);
      c.books += g._count._all;
      c.totalReads += g._sum?.views || 0;
    }
    return (id) => map[id] || emptyPublisherCounts();
  };
  const resolvePublisherForUser = async (req) => {
    const uid = req.user?.uid || req.user?.id;
    if (!uid) return null;
    const direct = await prisma2.publisher.findFirst({ where: { userId: uid } });
    if (direct) return direct;
    const contact = await prisma2.publisherContact.findFirst({ where: { userId: uid }, include: { publisher: true } });
    return contact?.publisher || null;
  };
  const requirePublisher = (req, res, next) => {
    if (req.user?.role !== "Publisher") return res.status(403).json({ error: "Publisher access only" });
    next();
  };
  app.get("/api/admin/publishers", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { search, status } = req.query;
      const where = {};
      if (status) where.tieUpStatus = status;
      if (search) where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { country: { contains: search, mode: "insensitive" } }
      ];
      const publishers = await prisma2.publisher.findMany({ where, orderBy: { createdAt: "desc" } });
      const countsFor = await getPublisherCountsMap();
      res.json(publishers.map((p) => ({ ...p, counts: countsFor(p.id) })));
    } catch (e2) {
      console.error("List publishers error:", e2);
      res.status(500).json({ error: "Failed to fetch publishers" });
    }
  });
  app.post("/api/admin/publishers", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { name, email, contactNumber, website, country, address, agreementNote, allowedContentTypes } = req.body;
      if (!name) return res.status(400).json({ error: "Publisher name is required" });
      const publisher = await prisma2.publisher.create({
        data: {
          name,
          email: email || null,
          contactNumber: contactNumber || null,
          website: website || null,
          country: country || null,
          address: address || null,
          agreementNote: agreementNote || null,
          allowedContentTypes: allowedContentTypes || ["Journals", "Books"],
          tieUpStatus: "Discovered",
          source: "Manual"
        }
      });
      res.json(publisher);
    } catch (e2) {
      console.error("Create publisher error:", e2);
      res.status(500).json({ error: "Failed to create publisher" });
    }
  });
  app.get("/api/admin/publishers/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const publisher = await prisma2.publisher.findUnique({
        where: { id: req.params.id },
        include: {
          locations: { orderBy: { isPrimary: "desc" } },
          contacts: { orderBy: { isPrimary: "desc" } },
          agreements: { orderBy: { createdAt: "desc" } },
          children: { orderBy: { name: "asc" } },
          parent: true
        }
      });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      res.json({ ...publisher, counts: await getPublisherCounts(publisher.id) });
    } catch (e2) {
      console.error("publisher detail:", e2);
      res.status(500).json({ error: "Failed to fetch publisher" });
    }
  });
  app.put("/api/admin/publishers/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { name, legalName, email, contactNumber, website, country, address, logoUrl, verified, orgType, parentId, agreementNote, allowedContentTypes, tieUpStatus } = req.body;
      const data = {};
      for (const [k, v] of Object.entries({ name, legalName, email, contactNumber, website, country, address, logoUrl, verified, orgType, agreementNote, allowedContentTypes, tieUpStatus })) {
        if (v !== void 0) data[k] = v;
      }
      if (parentId !== void 0) data.parentId = parentId && parentId !== req.params.id ? parentId : null;
      const publisher = await prisma2.publisher.update({ where: { id: req.params.id }, data });
      res.json(publisher);
    } catch (e2) {
      res.status(500).json({ error: "Failed to update publisher" });
    }
  });
  app.post("/api/admin/publishers/:id/tieup", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { email, contactNumber, website, country, address, agreementNote, allowedContentTypes } = req.body;
      const publisher = await prisma2.publisher.findUnique({ where: { id } });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      const loginEmail = (email || publisher.email || "").trim().toLowerCase();
      if (!loginEmail) return res.status(400).json({ error: "Email is required to create publisher login" });
      let user = await prisma2.user.findUnique({ where: { email: loginEmail } });
      let generatedPassword = "";
      if (!user) {
        generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!";
        const hashed = await import_bcryptjs.default.hash(generatedPassword, 10);
        user = await prisma2.user.create({
          data: { email: loginEmail, password: hashed, displayName: publisher.name, role: "Publisher", status: "Active", isFirstLogin: true }
        });
      } else {
        await prisma2.user.update({ where: { id: user.id }, data: { role: "Publisher" } });
      }
      const updated = await prisma2.publisher.update({
        where: { id },
        data: {
          email: loginEmail,
          contactNumber: contactNumber ?? publisher.contactNumber,
          website: website ?? publisher.website,
          country: country ?? publisher.country,
          address: address ?? publisher.address,
          agreementNote: agreementNote ?? publisher.agreementNote,
          allowedContentTypes: allowedContentTypes ?? publisher.allowedContentTypes,
          tieUpStatus: "Active",
          userId: user.id
        }
      });
      try {
        const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "info@celnet.in").trim();
        const appUrl = (process.env.APP_URL || "").trim() || "the STM Digital Library portal";
        const credsBlock = generatedPassword ? `<p style="margin:0 0 6px;"><b>Login Email:</b> ${loginEmail}</p><p style="margin:0 0 6px;"><b>Temporary Password:</b> ${generatedPassword}</p>` : `<p style="margin:0 0 6px;">Please log in with your existing account (${loginEmail}).</p>`;
        const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;color:#0f172a;">
          <h2 style="color:#0f172a;">Partnership Invitation \u2014 STM Digital Library</h2>
          <p>Dear ${publisher.name},</p>
          <p>We are delighted to invite you to partner with STM Digital Library. By sharing your open-access content, your journals gain increased visibility, readership and citations.</p>
          <div style="background:#f1f5f9;border-radius:10px;padding:16px;margin:16px 0;">${credsBlock}</div>
          <p>Log in at ${appUrl} to manage your catalogue.</p>
          <p style="color:#64748b;font-size:13px;">If you have any questions, simply reply to this email.</p>
        </div>`;
        await sendMail({
          from: `"STM Digital Library" <${emailFrom}>`,
          to: [loginEmail, process.env.ADMIN_EMAIL || "info@celnet.in"],
          subject: "Partnership Invitation & Login \u2014 STM Digital Library",
          html
        });
      } catch (mailErr) {
        console.error("Tie-up email failed:", mailErr);
      }
      res.json({ ...updated, credentialsSent: true, loginEmail, tempPassword: generatedPassword || null });
    } catch (e2) {
      console.error("Tie-up error:", e2);
      res.status(500).json({ error: "Failed to tie up publisher" });
    }
  });
  app.delete("/api/admin/publishers/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await prisma2.publisher.delete({ where: { id: req.params.id } });
      res.json({ message: "Publisher removed" });
    } catch (e2) {
      res.status(500).json({ error: "Failed to delete publisher (it may have linked content)" });
    }
  });
  app.post("/api/admin/publishers/:id/articles", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const publisher = await prisma2.publisher.findUnique({ where: { id: req.params.id } });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      const article = await prisma2.article.create({ data: mapArticleInput(req.body, publisher, req.body.status || "Published", req.user?.email || "Admin", "AdminEntered") });
      res.json(article);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to create article" });
    }
  });
  app.post("/api/admin/publishers/:id/books", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const publisher = await prisma2.publisher.findUnique({ where: { id: req.params.id } });
      if (!publisher) return res.status(404).json({ error: "Publisher not found" });
      const book = await prisma2.book.create({ data: mapBookInput(req.body, publisher, req.body.status || "Published", req.user?.email || "Admin", "AdminEntered") });
      res.json(book);
    } catch (e2) {
      res.status(500).json({ error: "Failed to create book" });
    }
  });
  app.get("/api/admin/review/pending", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const [articles, books] = await Promise.all([
        prisma2.article.findMany({ where: { status: "Draft" }, orderBy: { createdAt: "desc" }, take: 200 }),
        prisma2.book.findMany({ where: { status: "Draft" }, orderBy: { createdAt: "desc" }, take: 200 })
      ]);
      res.json({ articles, books });
    } catch (e2) {
      res.status(500).json({ error: "Failed to fetch review queue" });
    }
  });
  const reviewAction = (model) => async (req, res) => {
    try {
      const { id } = req.params;
      const { action, note } = req.body;
      if (action === "approve") {
        const updated = await prisma2[model].update({ where: { id }, data: { status: "Published", rejectionNote: null } });
        return res.json(updated);
      } else if (action === "reject") {
        const updated = await prisma2[model].update({ where: { id }, data: { status: "Rejected", rejectionNote: note || "Rejected by reviewer" } });
        return res.json(updated);
      }
      res.status(400).json({ error: "Invalid action (use approve|reject)" });
    } catch (e2) {
      res.status(500).json({ error: "Review action failed" });
    }
  };
  app.post("/api/admin/review/article/:id", authenticateJWT, requireAdminOrManager, reviewAction("article"));
  app.post("/api/admin/review/book/:id", authenticateJWT, requireAdminOrManager, reviewAction("book"));
  app.get("/api/publisher/me", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile linked to this account" });
      res.json({ ...publisher, counts: await getPublisherCounts(publisher.id, true) });
    } catch (e2) {
      res.status(500).json({ error: "Failed to load profile" });
    }
  });
  app.get("/api/publisher/content", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json({ articles: [], books: [] });
      const own = { publisherId: publisher.id, ownershipSource: { not: "Ingested" } };
      const [articles, books] = await Promise.all([
        prisma2.article.findMany({ where: own, orderBy: { createdAt: "desc" } }),
        prisma2.book.findMany({ where: own, orderBy: { createdAt: "desc" }, include: { chapters: true } })
      ]);
      res.json({ articles, books });
    } catch (e2) {
      res.status(500).json({ error: "Failed to load content" });
    }
  });
  app.post("/api/publisher/articles", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const article = await prisma2.article.create({ data: mapArticleInput(req.body, publisher, "Draft", publisher.name) });
      res.json(article);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to submit article" });
    }
  });
  app.post("/api/publisher/books", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const book = await prisma2.book.create({ data: mapBookInput(req.body, publisher, "Draft", publisher.name) });
      res.json(book);
    } catch (e2) {
      res.status(500).json({ error: "Failed to submit book" });
    }
  });
  app.put("/api/publisher/articles/:id", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const existing = await prisma2.article.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.publisherId !== publisher?.id || existing.ownershipSource === "Ingested") return res.status(403).json({ error: "Not your article" });
      const data = mapArticleInput(req.body, publisher, "Draft", publisher.name);
      delete data.publisherId;
      delete data.publisherName;
      const article = await prisma2.article.update({ where: { id: req.params.id }, data: { ...data, status: "Draft", rejectionNote: null } });
      res.json(article);
    } catch (e2) {
      res.status(500).json({ error: "Failed to update article" });
    }
  });
  app.put("/api/publisher/books/:id", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const existing = await prisma2.book.findUnique({ where: { id: req.params.id } });
      if (!existing || existing.publisherId !== publisher?.id || existing.ownershipSource === "Ingested") return res.status(403).json({ error: "Not your book" });
      const data = mapBookInput(req.body, publisher, "Draft", publisher.name);
      delete data.publisherId;
      delete data.publisherName;
      const book = await prisma2.book.update({ where: { id: req.params.id }, data: { ...data, status: "Draft", rejectionNote: null } });
      res.json(book);
    } catch (e2) {
      res.status(500).json({ error: "Failed to update book" });
    }
  });
  const UPLOAD_DIR = import_path2.default.join(APP_DIR, "uploads");
  app.use("/uploads", import_express.default.static(UPLOAD_DIR));
  const saveDataUrl = async (dataUrl, filename) => {
    const m2 = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl || "");
    if (!m2) throw new Error("Invalid file data");
    const buf = Buffer.from(m2[2], "base64");
    const fs4 = await import("node:fs");
    fs4.mkdirSync(UPLOAD_DIR, { recursive: true });
    const safe = (filename || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    fs4.writeFileSync(import_path2.default.join(UPLOAD_DIR, name), buf);
    return `/uploads/${name}`;
  };
  app.post("/api/upload", authenticateJWT, async (req, res) => {
    try {
      const { dataUrl, filename } = req.body;
      if (!dataUrl) return res.status(400).json({ error: "No file provided" });
      res.json({ url: await saveDataUrl(dataUrl, filename || "upload") });
    } catch (e2) {
      console.error("upload:", e2);
      res.status(500).json({ error: "Upload failed" });
    }
  });
  app.get("/api/admin/publisher-tree", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const all = await prisma2.publisher.findMany({ orderBy: { name: "asc" } });
      const countsFor = await getPublisherCountsMap();
      const byId = {};
      all.forEach((p) => {
        byId[p.id] = { ...p, counts: countsFor(p.id), children: [] };
      });
      const roots = [];
      all.forEach((p) => {
        if (p.parentId && byId[p.parentId]) byId[p.parentId].children.push(byId[p.id]);
        else roots.push(byId[p.id]);
      });
      res.json(roots);
    } catch (e2) {
      console.error("publisher tree:", e2);
      res.status(500).json({ error: "Failed to build tree" });
    }
  });
  app.post("/api/admin/publishers/:id/locations", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { label, type, country, city, address, isPrimary } = req.body;
      const loc = await prisma2.publisherLocation.create({ data: { publisherId: req.params.id, label: label || null, type: type || "Office", country: country || null, city: city || null, address: address || null, isPrimary: !!isPrimary } });
      res.json(loc);
    } catch (e2) {
      res.status(500).json({ error: "Failed to add location" });
    }
  });
  app.put("/api/admin/locations/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const data = {};
      for (const k of ["label", "type", "country", "city", "address", "isPrimary"]) if (req.body[k] !== void 0) data[k] = req.body[k];
      res.json(await prisma2.publisherLocation.update({ where: { id: req.params.id }, data }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to update location" });
    }
  });
  app.delete("/api/admin/locations/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await prisma2.publisherLocation.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e2) {
      res.status(500).json({ error: "Failed to delete location" });
    }
  });
  app.post("/api/admin/publishers/:id/contacts", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { name, email, title, phone, isPrimary } = req.body;
      if (!name) return res.status(400).json({ error: "Contact name is required" });
      const c = await prisma2.publisherContact.create({ data: { publisherId: req.params.id, name, email: email || null, title: title || null, phone: phone || null, isPrimary: !!isPrimary } });
      res.json(c);
    } catch (e2) {
      res.status(500).json({ error: "Failed to add contact" });
    }
  });
  app.put("/api/admin/contacts/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const data = {};
      for (const k of ["name", "email", "title", "phone", "isPrimary"]) if (req.body[k] !== void 0) data[k] = req.body[k];
      res.json(await prisma2.publisherContact.update({ where: { id: req.params.id }, data }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to update contact" });
    }
  });
  app.delete("/api/admin/contacts/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await prisma2.publisherContact.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e2) {
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });
  app.post("/api/admin/contacts/:id/invite", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const contact = await prisma2.publisherContact.findUnique({ where: { id: req.params.id }, include: { publisher: true } });
      if (!contact) return res.status(404).json({ error: "Contact not found" });
      const loginEmail = (contact.email || "").trim().toLowerCase();
      if (!loginEmail) return res.status(400).json({ error: "Contact needs an email to receive a login" });
      let user = await prisma2.user.findUnique({ where: { email: loginEmail } });
      let tempPassword = "";
      if (!user) {
        tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + "!";
        user = await prisma2.user.create({ data: { displayName: contact.name, email: loginEmail, password: await import_bcryptjs.default.hash(tempPassword, 10), role: "Publisher", status: "Active", isFirstLogin: true } });
      } else if (user.role !== "Publisher") {
        user = await prisma2.user.update({ where: { id: user.id }, data: { role: "Publisher" } });
      }
      await prisma2.publisherContact.update({ where: { id: contact.id }, data: { userId: user.id, scopeNodeId: contact.publisherId } });
      res.json({ ok: true, email: loginEmail, tempPassword: tempPassword || null, note: tempPassword ? "Share these credentials securely." : "Existing account upgraded to a publisher seat." });
    } catch (e2) {
      console.error("contact invite:", e2);
      res.status(500).json({ error: "Failed to create seat" });
    }
  });
  app.post("/api/admin/publishers/:id/merge", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const from = req.params.id;
      const to = req.body.targetId;
      if (!to || to === from) return res.status(400).json({ error: "Pick a different target publisher" });
      const target = await prisma2.publisher.findUnique({ where: { id: to } });
      if (!target) return res.status(404).json({ error: "Target publisher not found" });
      await prisma2.journal.updateMany({ where: { publisherId: from }, data: { publisherId: to, publisherName: target.name } });
      await prisma2.article.updateMany({ where: { publisherId: from }, data: { publisherId: to, publisherName: target.name } });
      await prisma2.book.updateMany({ where: { publisherId: from }, data: { publisherId: to, publisherName: target.name } });
      await prisma2.publisherLocation.updateMany({ where: { publisherId: from }, data: { publisherId: to } });
      await prisma2.publisherContact.updateMany({ where: { publisherId: from }, data: { publisherId: to } });
      await prisma2.publisherAgreement.updateMany({ where: { publisherId: from }, data: { publisherId: to } });
      await prisma2.publisher.updateMany({ where: { parentId: from }, data: { parentId: to } });
      await prisma2.publisher.delete({ where: { id: from } });
      res.json({ ok: true, mergedInto: to });
    } catch (e2) {
      console.error("merge:", e2);
      res.status(500).json({ error: "Merge failed" });
    }
  });
  const pushAudit = (agreement, event, by, req) => {
    const trail = Array.isArray(agreement.auditTrail) ? agreement.auditTrail : [];
    trail.push({ event, by: by || null, ip: req.ip || req.headers["x-forwarded-for"] || null, at: (/* @__PURE__ */ new Date()).toISOString() });
    return trail;
  };
  app.post("/api/admin/publishers/:id/agreements", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { title, documentUrl, body, version, note } = req.body;
      if (!title) return res.status(400).json({ error: "Agreement title is required" });
      const ag = await prisma2.publisherAgreement.create({
        data: { publisherId: req.params.id, title, documentUrl: documentUrl || null, body: body || null, version: version || "1.0", note: note || null, status: "Draft", createdBy: req.user?.email || "Admin", auditTrail: [{ event: "created", by: req.user?.email || "Admin", at: (/* @__PURE__ */ new Date()).toISOString() }] }
      });
      res.json(ag);
    } catch (e2) {
      console.error("create agreement:", e2);
      res.status(500).json({ error: "Failed to create agreement" });
    }
  });
  app.post("/api/admin/agreements/:id/send", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const ag = await prisma2.publisherAgreement.findUnique({ where: { id: req.params.id } });
      if (!ag) return res.status(404).json({ error: "Agreement not found" });
      const updated = await prisma2.publisherAgreement.update({ where: { id: ag.id }, data: { status: "Sent", sentAt: /* @__PURE__ */ new Date(), auditTrail: pushAudit(ag, "sent", req.user?.email || "Admin", req) } });
      res.json(updated);
    } catch (e2) {
      res.status(500).json({ error: "Failed to send agreement" });
    }
  });
  app.delete("/api/admin/agreements/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await prisma2.publisherAgreement.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e2) {
      res.status(500).json({ error: "Failed to delete agreement" });
    }
  });
  app.get("/api/publisher/agreements", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json([]);
      const list = await prisma2.publisherAgreement.findMany({ where: { publisherId: publisher.id }, orderBy: { createdAt: "desc" } });
      await Promise.all(list.filter((a) => a.status === "Sent").map(
        (a) => prisma2.publisherAgreement.update({ where: { id: a.id }, data: { status: "Viewed", viewedAt: /* @__PURE__ */ new Date(), auditTrail: pushAudit(a, "viewed", publisher.name, req) } })
      ));
      res.json(list);
    } catch (e2) {
      res.status(500).json({ error: "Failed to load agreements" });
    }
  });
  app.post("/api/publisher/agreements/:id/sign", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const ag = await prisma2.publisherAgreement.findUnique({ where: { id: req.params.id } });
      if (!ag || ag.publisherId !== publisher?.id) return res.status(403).json({ error: "Not your agreement" });
      if (ag.status === "Accepted") return res.status(400).json({ error: "Already signed" });
      const { signatureType, signatureData, name, email } = req.body;
      if (!signatureData || !name) return res.status(400).json({ error: "A signature and signer name are required" });
      const updated = await prisma2.publisherAgreement.update({
        where: { id: ag.id },
        data: {
          status: "Accepted",
          decidedAt: /* @__PURE__ */ new Date(),
          acceptedByName: name,
          acceptedByEmail: email || null,
          signatureType: signatureType || "typed",
          signatureData,
          ipAddress: req.ip || null,
          userAgent: req.headers["user-agent"] || null,
          auditTrail: pushAudit(ag, "accepted", name, req)
        }
      });
      res.json(updated);
    } catch (e2) {
      console.error("sign agreement:", e2);
      res.status(500).json({ error: "Failed to sign" });
    }
  });
  app.post("/api/publisher/agreements/:id/decline", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      const ag = await prisma2.publisherAgreement.findUnique({ where: { id: req.params.id } });
      if (!ag || ag.publisherId !== publisher?.id) return res.status(403).json({ error: "Not your agreement" });
      const updated = await prisma2.publisherAgreement.update({ where: { id: ag.id }, data: { status: "Declined", decidedAt: /* @__PURE__ */ new Date(), declineReason: req.body.reason || null, auditTrail: pushAudit(ag, "declined", publisher.name, req) } });
      res.json(updated);
    } catch (e2) {
      res.status(500).json({ error: "Failed to decline" });
    }
  });
  app.post("/api/publisher/uploads", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const { kind = "article", fileName, items } = req.body;
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: "No rows to import" });
      const batch = await prisma2.publisherUpload.create({ data: { publisherId: publisher.id, kind, fileName: fileName || null, rows: items.length, status: "Pending", createdBy: publisher.name } });
      let accepted = 0, rejected = 0;
      for (const row of items) {
        try {
          if (!row.title) {
            rejected++;
            continue;
          }
          const data = kind === "book" ? mapBookInput({ ...row, uploadId: batch.id }, publisher, "Draft", publisher.name) : mapArticleInput({ ...row, uploadId: batch.id }, publisher, "Draft", publisher.name);
          await prisma2[kind === "book" ? "book" : "article"].create({ data });
          accepted++;
        } catch {
          rejected++;
        }
      }
      const done = await prisma2.publisherUpload.update({ where: { id: batch.id }, data: { accepted, rejected, status: "Processed" } });
      res.json({ ...done, accepted, rejected });
    } catch (e2) {
      console.error("publisher upload:", e2);
      res.status(500).json({ error: "Bulk import failed" });
    }
  });
  app.get("/api/publisher/uploads", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json([]);
      res.json(await prisma2.publisherUpload.findMany({ where: { publisherId: publisher.id }, orderBy: { createdAt: "desc" } }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to load uploads" });
    }
  });
  app.post("/api/admin/review/bulk", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { model, ids, action, note } = req.body;
      if (!["article", "book"].includes(model) || !Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "Provide model + ids" });
      const data = action === "approve" ? { status: "Published", rejectionNote: null } : { status: "Rejected", rejectionNote: note || "Rejected by reviewer" };
      const r2 = await prisma2[model].updateMany({ where: { id: { in: ids } }, data });
      res.json({ ok: true, count: r2.count });
    } catch (e2) {
      res.status(500).json({ error: "Bulk review failed" });
    }
  });
  app.get("/api/admin/agreement-templates", authenticateJWT, requireAdminOrManager, async (_req, res) => {
    try {
      res.json(await prisma2.agreementTemplate.findMany({ orderBy: { createdAt: "desc" } }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to load templates" });
    }
  });
  app.post("/api/admin/agreement-templates", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { title, version, body } = req.body;
      if (!title) return res.status(400).json({ error: "Template title required" });
      res.json(await prisma2.agreementTemplate.create({ data: { title, version: version || "1.0", body: body || null, createdBy: req.user?.email || "Admin" } }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to save template" });
    }
  });
  app.delete("/api/admin/agreement-templates/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await prisma2.agreementTemplate.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (e2) {
      res.status(500).json({ error: "Failed to delete template" });
    }
  });
  app.get("/api/admin/publishers/:id/messages", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const msgs = await prisma2.publisherMessage.findMany({ where: { publisherId: req.params.id }, orderBy: { createdAt: "asc" } });
      await prisma2.publisherMessage.updateMany({ where: { publisherId: req.params.id, sender: "publisher", readAt: null }, data: { readAt: /* @__PURE__ */ new Date() } });
      res.json(msgs);
    } catch (e2) {
      res.status(500).json({ error: "Failed to load messages" });
    }
  });
  app.post("/api/admin/publishers/:id/messages", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { body, attachmentUrl } = req.body;
      if (!body?.trim() && !attachmentUrl) return res.status(400).json({ error: "Message is empty" });
      res.json(await prisma2.publisherMessage.create({ data: { publisherId: req.params.id, sender: "admin", senderName: req.user?.email || "STM Team", body: body || "", attachmentUrl: attachmentUrl || null } }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to send" });
    }
  });
  app.get("/api/publisher/messages", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json([]);
      const msgs = await prisma2.publisherMessage.findMany({ where: { publisherId: publisher.id }, orderBy: { createdAt: "asc" } });
      await prisma2.publisherMessage.updateMany({ where: { publisherId: publisher.id, sender: "admin", readAt: null }, data: { readAt: /* @__PURE__ */ new Date() } });
      res.json(msgs);
    } catch (e2) {
      res.status(500).json({ error: "Failed to load messages" });
    }
  });
  app.post("/api/publisher/messages", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.status(404).json({ error: "No publisher profile" });
      const { body, attachmentUrl } = req.body;
      if (!body?.trim() && !attachmentUrl) return res.status(400).json({ error: "Message is empty" });
      res.json(await prisma2.publisherMessage.create({ data: { publisherId: publisher.id, sender: "publisher", senderName: publisher.name, body: body || "", attachmentUrl: attachmentUrl || null } }));
    } catch (e2) {
      res.status(500).json({ error: "Failed to send" });
    }
  });
  app.get("/api/publisher/notifications", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json({ total: 0, unreadMessages: 0, pendingAgreements: 0 });
      const [unreadMessages, pendingAgreements] = await Promise.all([
        prisma2.publisherMessage.count({ where: { publisherId: publisher.id, sender: "admin", readAt: null } }),
        prisma2.publisherAgreement.count({ where: { publisherId: publisher.id, status: { in: ["Sent", "Viewed"] } } })
      ]);
      res.json({ total: unreadMessages + pendingAgreements, unreadMessages, pendingAgreements });
    } catch (e2) {
      res.status(500).json({ error: "Failed to load notifications" });
    }
  });
  const readAnalytics = async (publisherId, days = 30) => {
    const since = new Date(Date.now() - days * 864e5);
    const series = await prisma2.$queryRaw`SELECT to_char(date_trunc('day', "at"), 'YYYY-MM-DD') as day, count(*)::int as reads FROM "ReadEvent" WHERE "publisherId" = ${publisherId} AND "at" >= ${since} GROUP BY 1 ORDER BY 1`;
    const topArticles = await prisma2.article.findMany({ where: { publisherId, ownershipSource: { not: "Ingested" }, views: { gt: 0 } }, orderBy: { views: "desc" }, take: 5, select: { id: true, title: true, views: true } });
    const totalReads = series.reduce((s2, r2) => s2 + Number(r2.reads), 0);
    return { days, series, topArticles, totalReads };
  };
  app.get("/api/publisher/analytics", authenticateJWT, requirePublisher, async (req, res) => {
    try {
      const publisher = await resolvePublisherForUser(req);
      if (!publisher) return res.json({ series: [], topArticles: [], totalReads: 0 });
      res.json(await readAnalytics(publisher.id, Math.min(parseInt(req.query.days) || 30, 120)));
    } catch (e2) {
      console.error("pub analytics:", e2);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });
  app.get("/api/admin/publishers/:id/analytics", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      res.json(await readAnalytics(req.params.id, Math.min(parseInt(req.query.days) || 30, 120)));
    } catch (e2) {
      res.status(500).json({ error: "Failed to load analytics" });
    }
  });
  app.get("/api/admin/notifications", authenticateJWT, requireAdminOrManager, async (_req, res) => {
    try {
      const unread = await prisma2.publisherMessage.findMany({
        where: { sender: "publisher", readAt: null },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { publisher: { select: { id: true, name: true } } }
      });
      const byPub = {};
      for (const m2 of unread) {
        const k = m2.publisherId;
        if (!byPub[k]) byPub[k] = { publisherId: k, publisherName: m2.publisher?.name || "Publisher", count: 0, preview: m2.body, at: m2.createdAt };
        byPub[k].count++;
      }
      const messages = Object.values(byPub);
      const [pa, pb] = await Promise.all([
        prisma2.article.count({ where: { status: "Draft" } }),
        prisma2.book.count({ where: { status: "Draft" } })
      ]);
      const reviewCount = pa + pb;
      const recent = await prisma2.publisherAgreement.findMany({
        where: { status: { in: ["Accepted", "Declined"] }, decidedAt: { gte: new Date(Date.now() - 7 * 864e5) } },
        orderBy: { decidedAt: "desc" },
        take: 10,
        include: { publisher: { select: { name: true } } }
      });
      res.json({
        total: unread.length + reviewCount,
        unreadMessages: unread.length,
        messages,
        reviewCount,
        recentAgreements: recent.map((a) => ({ title: a.title, status: a.status, publisherName: a.publisher?.name, at: a.decidedAt }))
      });
    } catch (e2) {
      console.error("notifications:", e2);
      res.status(500).json({ error: "Failed to load notifications" });
    }
  });
  const articleFingerprint = (doi, title, authors) => {
    if (doi) return `doi:${String(doi).toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "")}`;
    return `ta:${(title || "").toLowerCase().trim().slice(0, 180)}|${(authors || "").toLowerCase().trim().slice(0, 80)}`;
  };
  const upsertPublisherByName = async (name, source) => {
    if (!name) return null;
    const existing = await prisma2.publisher.findFirst({ where: { name } });
    if (existing) return existing;
    try {
      return await prisma2.publisher.create({ data: { name, tieUpStatus: "Discovered", source } });
    } catch {
      return prisma2.publisher.findFirst({ where: { name } });
    }
  };
  const upsertJournalByIssn = async (issn, data) => {
    if (!issn) return null;
    const existing = await prisma2.journal.findUnique({ where: { issn } });
    if (existing) return existing;
    try {
      return await prisma2.journal.create({ data: { ...data, issn } });
    } catch {
      return prisma2.journal.findUnique({ where: { issn } });
    }
  };
  const TRUSTED_PDF_HOSTS = [
    "arxiv.org",
    "biorxiv.org",
    "medrxiv.org",
    "biomedcentral.com",
    // all BMC journals (*.biomedcentral.com) — verified
    "journals.plos.org",
    "plos.org",
    "frontiersin.org",
    "elifesciences.org",
    "peerj.com",
    "nature.com",
    // OA articles — verified
    "escholarship.org",
    // UC repository — verified
    "f1000research.com",
    "wellcomeopenresearch.org",
    "gatesopenresearch.org",
    "dovepress.com",
    "copernicus.org",
    // *.copernicus.org (ACP, ESSD, etc.)
    "mdpi-res.com",
    // MDPI's asset CDN (mdpi.com itself is blocked)
    "ojs.",
    "jstage.jst.go.jp",
    "scielo.br",
    "scielo.org"
  ];
  function isTrustedPdfHost(url) {
    if (!url) return false;
    try {
      const h2 = new URL(url).hostname.replace(/^www\./, "");
      return TRUSTED_PDF_HOSTS.some((t2) => h2 === t2 || h2.endsWith("." + t2) || h2.endsWith(t2) || h2.includes(t2));
    } catch {
      return false;
    }
  }
  const mapOpenAlexWork = (w) => {
    const src = w.primary_location?.source || {};
    return {
      title: w.title || w.display_name || "Untitled",
      authors: (w.authorships || []).map((a) => a.author?.display_name).filter(Boolean).join(", "),
      doi: w.doi || null,
      pdfUrl: w.best_oa_location?.pdf_url || w.open_access?.oa_url || null,
      journalName: src.display_name || null,
      issn: src.issn_l || src.issn && src.issn[0] || null,
      publisherName: src.host_organization_name || null,
      volume: w.biblio?.volume || null,
      issue: w.biblio?.issue || null,
      year: w.publication_year || null,
      subject: (w.concepts || [])[0]?.display_name || null,
      openAccess: !!w.open_access?.is_oa,
      source: "OpenAlex"
    };
  };
  async function fetchOpenAlex(department, perDept, trustedOnly = false) {
    const out = [];
    const perPage = 200;
    let cursor = "*";
    const maxPages = trustedOnly ? 30 : Math.max(1, Math.ceil(perDept / perPage));
    for (let page = 0; page < maxPages; page++) {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(department)}&filter=has_doi:true,open_access.is_oa:true,primary_location.source.type:journal&per-page=${perPage}&cursor=${encodeURIComponent(cursor)}`;
      const r2 = await fetch(url);
      const d = await r2.json();
      const results = d?.results || [];
      if (!results.length) break;
      for (const w of results) {
        const m2 = mapOpenAlexWork(w);
        if (!m2.pdfUrl) continue;
        if (trustedOnly && !isTrustedPdfHost(m2.pdfUrl)) continue;
        out.push(m2);
        if (out.length >= perDept) break;
      }
      if (out.length >= perDept) break;
      cursor = d?.meta?.next_cursor;
      if (!cursor) break;
    }
    return out.slice(0, perDept);
  }
  async function fetchDOAJ(department, perDept, trustedOnly = false) {
    const url = `https://doaj.org/api/search/articles/${encodeURIComponent(department)}?pageSize=${Math.min(perDept * (trustedOnly ? 5 : 1), 100)}`;
    const r2 = await fetch(url);
    const d = await r2.json();
    const results = d?.results || [];
    const mapped = results.map((rec) => {
      const b = rec.bibjson || {};
      const ids = b.identifier || [];
      const issnObj = ids.find((i2) => i2.type === "eissn") || ids.find((i2) => i2.type === "pissn");
      const pdfLink = (b.link || []).find((l) => l.type === "fulltext");
      return {
        title: b.title || "Untitled",
        authors: (b.author || []).map((a) => a.name).filter(Boolean).join(", "),
        doi: (ids.find((i2) => i2.type === "doi") || {}).id || null,
        pdfUrl: pdfLink?.url || null,
        journalName: b.journal?.title || null,
        issn: issnObj?.id || null,
        publisherName: b.journal?.publisher || null,
        volume: b.journal?.volume || null,
        issue: b.journal?.number || null,
        year: b.year ? parseInt(b.year) : null,
        subject: (b.subject || [])[0]?.term || null,
        openAccess: true,
        source: "DOAJ"
      };
    }).filter((x2) => x2.pdfUrl || x2.doi);
    return (trustedOnly ? mapped.filter((x2) => isTrustedPdfHost(x2.pdfUrl)) : mapped).slice(0, perDept);
  }
  async function fetchArxiv(department, perDept) {
    const q = encodeURIComponent(department);
    const url = `http://export.arxiv.org/api/query?search_query=all:${q}&start=0&max_results=${Math.min(perDept, 50)}&sortBy=submittedDate&sortOrder=descending`;
    const r2 = await fetch(url);
    const xml = await r2.text();
    const entries = xml.split("<entry>").slice(1);
    return entries.map((e2) => {
      const get = (tag) => {
        const m2 = e2.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
        return m2 ? m2[1].replace(/\s+/g, " ").trim() : "";
      };
      const arxivId = (get("id").split("/abs/")[1] || "").replace(/v\d+$/, "");
      const published = get("published");
      return {
        title: get("title") || "Untitled",
        authors: [...e2.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m2) => m2[1].trim()).join(", "),
        doi: get("arxiv:doi") || null,
        pdfUrl: arxivId ? `https://arxiv.org/pdf/${arxivId}` : null,
        journalName: get("arxiv:journal_ref") || "arXiv",
        issn: null,
        publisherName: "arXiv",
        volume: null,
        issue: null,
        year: published ? parseInt(published.slice(0, 4)) : null,
        subject: null,
        openAccess: true,
        source: "arXiv"
      };
    }).filter((a) => a.pdfUrl);
  }
  const PDF_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  async function isFetchablePdf(url) {
    if (!url) return false;
    try {
      const nodeFetch = (await Promise.resolve().then(() => (init_src(), src_exports))).default;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12e3);
      const res = await nodeFetch(url, {
        method: "GET",
        headers: { "User-Agent": PDF_UA, "Accept": "application/pdf,*/*", "Range": "bytes=0-2047" },
        redirect: "follow",
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (res.status >= 400) return false;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/pdf")) return true;
      if (ct.includes("text/html")) return false;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.slice(0, 5).toString("latin1").startsWith("%PDF");
    } catch {
      return false;
    }
  }
  async function fetchEuropePMC(department, perDept) {
    const q = encodeURIComponent(`${department} AND OPEN_ACCESS:Y`);
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${q}&format=json&pageSize=${Math.min(perDept, 50)}&resultType=core`;
    const r2 = await fetch(url);
    const d = await r2.json();
    const results = d?.resultList?.result || [];
    return results.map((x2) => {
      const ji = x2.journalInfo || {};
      const j = ji.journal || {};
      const urls = x2.fullTextUrlList?.fullTextUrl || [];
      const pdf = urls.find((u) => u.documentStyle === "pdf");
      const html = urls.find((u) => u.documentStyle === "html");
      const readUrl = pdf?.url || html?.url || (x2.pmcid ? `https://europepmc.org/article/PMC/${x2.pmcid}` : x2.doi ? `https://doi.org/${x2.doi}` : null);
      return {
        title: x2.title || "Untitled",
        authors: x2.authorString || null,
        doi: x2.doi || null,
        pdfUrl: readUrl,
        journalName: j.title || null,
        issn: j.issn || j.essn || null,
        publisherName: null,
        volume: ji.volume || null,
        issue: ji.issue || null,
        year: ji.yearOfPublication ? parseInt(ji.yearOfPublication) : x2.pubYear ? parseInt(x2.pubYear) : null,
        subject: null,
        openAccess: true,
        source: "EuropePMC"
      };
    }).filter((a) => a.title && a.pdfUrl);
  }
  const fetchForDept = (source, dept, limit, trustedOnly = false) => source === "doaj" ? fetchDOAJ(dept, limit, trustedOnly) : source === "arxiv" ? fetchArxiv(dept, limit) : source === "europepmc" ? fetchEuropePMC(dept, limit) : fetchOpenAlex(dept, limit, trustedOnly);
  async function keepOpenable(items, concurrency = 12) {
    const kept = [];
    let skipped = 0;
    for (let i2 = 0; i2 < items.length; i2 += concurrency) {
      const batch = items.slice(i2, i2 + concurrency);
      const oks = await Promise.all(batch.map((it) => isFetchablePdf(it.pdfUrl)));
      batch.forEach((it, j) => oks[j] ? kept.push(it) : skipped++);
    }
    return { kept, skipped };
  }
  app.post("/api/admin/ingest/preview", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { source = "openalex", departments = [], perDept = 10 } = req.body;
      if (!Array.isArray(departments) || !departments.length) return res.status(400).json({ error: "Select at least one department" });
      const trustedOnly = req.body.trustedHostsOnly !== false && (source === "openalex" || source === "doaj");
      const limit = Math.min(Math.max(parseInt(perDept) || 10, 1), 50);
      const items = [];
      for (const dept of departments) {
        try {
          const got = await fetchForDept(source, dept, limit, trustedOnly);
          items.push(...got.map((x2) => ({ ...x2, department: dept })));
        } catch (e2) {
          console.error(`Preview fetch [${source}/${dept}]`, e2);
        }
      }
      res.json({ source, trustedOnly, count: items.length, items });
    } catch (e2) {
      console.error("Ingest preview error:", e2);
      res.status(500).json({ error: "Preview failed" });
    }
  });
  const ingestJobs = /* @__PURE__ */ new Map();
  async function processIngestJob(job, req) {
    const { source, departments, limit, validate, trustedOnly } = job.params;
    const publishersTouched = /* @__PURE__ */ new Set();
    try {
      for (const dept of departments) {
        job.currentDept = dept;
        let items = [];
        try {
          items = await fetchForDept(source, dept, limit, trustedOnly);
        } catch (e2) {
          console.error(`Ingest fetch [${source}/${dept}]`, e2);
          continue;
        }
        job.fetched += items.length;
        if (validate) {
          const { kept, skipped } = await keepOpenable(items);
          job.skippedUnopenable += skipped;
          items = kept;
        }
        for (const it of items) {
          try {
            const fp = articleFingerprint(it.doi, it.title, it.authors);
            const exists = await prisma2.article.findUnique({ where: { fingerprint: fp } });
            if (exists) {
              job.duplicates++;
              continue;
            }
            const publisher = await upsertPublisherByName(it.publisherName, it.source);
            if (publisher) publishersTouched.add(publisher.id);
            const journal = await upsertJournalByIssn(it.issn, {
              title: it.journalName || "Unknown Journal",
              publisherId: publisher?.id || null,
              publisherName: it.publisherName || null,
              domain: dept,
              subject: it.subject || null,
              openAccess: !!it.openAccess,
              startYear: it.year || null
            });
            await prisma2.article.create({
              data: {
                title: it.title,
                authors: it.authors || null,
                doi: it.doi || null,
                pdfUrl: it.pdfUrl || null,
                journalId: journal?.id || null,
                journalName: it.journalName || null,
                journalIssn: it.issn || null,
                publisherId: publisher?.id || null,
                publisherName: it.publisherName || null,
                volume: it.volume ? String(it.volume) : null,
                issue: it.issue ? String(it.issue) : null,
                year: it.year || null,
                domain: dept,
                subject: it.subject || null,
                accessType: "OpenAccess",
                status: "Published",
                source: it.source,
                fingerprint: fp,
                createdBy: req.user?.email || "Ingestion"
              }
            });
            job.inserted++;
          } catch (e2) {
            job.failed++;
          }
        }
      }
      job.publishersDiscovered = publishersTouched.size;
      job.status = "done";
    } catch (e2) {
      console.error("Ingest job error:", e2);
      job.status = "error";
      job.error = e2?.message || "Ingestion failed";
    } finally {
      job.currentDept = null;
      job.finishedAt = Date.now();
    }
  }
  app.post("/api/admin/ingest/run", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { source = "openalex", departments = [], perDept = 25 } = req.body;
      if (!Array.isArray(departments) || !departments.length) return res.status(400).json({ error: "Select at least one department" });
      const limit = Math.min(Math.max(parseInt(perDept) || 25, 1), 300);
      const validate = req.body.validatePdf !== false;
      const trustedOnly = req.body.trustedHostsOnly !== false && (source === "openalex" || source === "doaj");
      const jobId = `ing_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const job = {
        id: jobId,
        status: "running",
        startedAt: Date.now(),
        finishedAt: null,
        currentDept: null,
        params: { source, departments, limit, validate, trustedOnly },
        source,
        trustedOnly,
        departments,
        totalDepts: departments.length,
        fetched: 0,
        inserted: 0,
        duplicates: 0,
        failed: 0,
        skippedUnopenable: 0,
        publishersDiscovered: 0
      };
      ingestJobs.set(jobId, job);
      processIngestJob(job, req).finally(() => {
        setTimeout(() => ingestJobs.delete(jobId), 30 * 60 * 1e3);
      });
      res.json({ started: true, jobId, ...jobSummary(job) });
    } catch (e2) {
      console.error("Ingest run error:", e2);
      res.status(500).json({ error: "Ingestion failed" });
    }
  });
  const jobSummary = (job) => ({
    jobId: job.id,
    status: job.status,
    source: job.source,
    trustedOnly: job.trustedOnly,
    departments: job.departments,
    totalDepts: job.totalDepts,
    currentDept: job.currentDept,
    fetched: job.fetched,
    inserted: job.inserted,
    duplicates: job.duplicates,
    failed: job.failed,
    skippedUnopenable: job.skippedUnopenable,
    publishersDiscovered: job.publishersDiscovered,
    error: job.error || null
  });
  app.get("/api/admin/ingest/status/:jobId", authenticateJWT, requireSuperAdmin, async (req, res) => {
    const job = ingestJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found (may have finished & expired)" });
    res.json(jobSummary(job));
  });
  const libraryScopeDomains = async (req) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    let ud = null;
    try {
      ud = import_jsonwebtoken.default.verify(authHeader.split(" ")[1], JWT_SECRET);
    } catch {
      return null;
    }
    if (["SuperAdmin", "Admin", "ContentManager"].includes(ud.role)) return null;
    const subs = await getUserActiveSubscriptions(ud.uid, ud.role, ud.institutionId);
    const domains = /* @__PURE__ */ new Set();
    for (const s2 of subs) {
      const d = Array.isArray(s2.domains) ? s2.domains : s2.domains ? JSON.parse(s2.domains) : [];
      d.forEach((x2) => x2 && domains.add(x2));
      if (s2.domainName) domains.add(s2.domainName);
    }
    return [...domains];
  };
  const applyDomainScope = (where, requestedDomain, scope) => {
    if (scope === null) {
      if (requestedDomain) where.domain = requestedDomain;
      return;
    }
    const allowed = scope.length ? scope : ["__no_access__"];
    if (requestedDomain) where.domain = allowed.includes(requestedDomain) ? requestedDomain : "__no_access__";
    else where.domain = { in: allowed };
  };
  app.get("/api/library/publishers", async (req, res) => {
    try {
      const { domain } = req.query;
      const where = { status: "Published" };
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      const groups = await prisma2.article.groupBy({ by: ["publisherName"], where, _count: { _all: true } });
      const list = groups.filter((g) => g.publisherName).map((g) => ({ name: g.publisherName, count: g._count._all })).sort((a, b) => b.count - a.count);
      res.json(list);
    } catch (e2) {
      console.error("library publishers:", e2);
      res.status(500).json({ error: "Failed to load publishers" });
    }
  });
  app.get("/api/library/journals", async (req, res) => {
    try {
      const { domain, recentYears, search, publisher } = req.query;
      const where = {};
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      if (recentYears) {
        where.startYear = { gte: (/* @__PURE__ */ new Date()).getFullYear() - (parseInt(recentYears) || 0) };
      }
      if (publisher) where.publisherName = publisher;
      if (search) where.title = { contains: search, mode: "insensitive" };
      const journals = await prisma2.journal.findMany({ where, orderBy: { title: "asc" }, take: 500 });
      const groups = journals.length ? await prisma2.article.groupBy({
        by: ["journalId"],
        where: { status: "Published", journalId: { in: journals.map((j) => j.id) } },
        _count: { _all: true }
      }) : [];
      const countBy = new Map(groups.map((g) => [g.journalId, g._count._all]));
      const withCounts = journals.map((j) => ({
        id: j.id,
        title: j.title,
        issn: j.issn,
        publisherName: j.publisherName,
        domain: j.domain,
        startYear: j.startYear,
        articleCount: countBy.get(j.id) || 0
      }));
      res.json(withCounts.filter((j) => j.articleCount > 0));
    } catch (e2) {
      console.error("library journals:", e2);
      res.status(500).json({ error: "Failed to load journals" });
    }
  });
  app.get("/api/library/facets", async (req, res) => {
    try {
      const { journalId, journalIds, year, volume } = req.query;
      const base = { status: "Published" };
      const jidList = journalIds ? String(journalIds).split(",").filter(Boolean) : [];
      if (jidList.length) base.journalId = { in: jidList };
      else if (journalId) base.journalId = journalId;
      const years = await prisma2.article.findMany({ where: base, distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } });
      const volWhere = { ...base };
      if (year) volWhere.year = parseInt(year);
      const volumes = await prisma2.article.findMany({ where: volWhere, distinct: ["volume"], select: { volume: true } });
      const issWhere = { ...volWhere };
      if (volume) issWhere.volume = String(volume);
      const issues = await prisma2.article.findMany({ where: issWhere, distinct: ["issue"], select: { issue: true } });
      res.json({
        years: years.map((y) => y.year).filter((v) => v != null),
        volumes: volumes.map((v) => v.volume).filter(Boolean),
        issues: issues.map((i2) => i2.issue).filter(Boolean)
      });
    } catch (e2) {
      res.status(500).json({ error: "Failed to load facets" });
    }
  });
  app.get("/api/library/articles", async (req, res) => {
    try {
      const { domain, journalId, journalIds, journalIssn, publisher, year, volume, issue, search, page = "1", limit = "20" } = req.query;
      const where = { status: "Published" };
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      const jidList = journalIds ? String(journalIds).split(",").filter(Boolean) : [];
      if (jidList.length) where.journalId = { in: jidList };
      else if (journalId) where.journalId = journalId;
      if (journalIssn) where.journalIssn = journalIssn;
      if (publisher) where.publisherName = publisher;
      if (year) where.year = parseInt(year);
      if (volume) where.volume = String(volume);
      if (issue) where.issue = String(issue);
      if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }, { authors: { contains: search, mode: "insensitive" } }];
      const take = Math.min(parseInt(limit) || 20, 100);
      const skip = ((parseInt(page) || 1) - 1) * take;
      const [data, total] = await Promise.all([
        prisma2.article.findMany({
          where,
          orderBy: [{ year: "desc" }, { createdAt: "desc" }],
          skip,
          take,
          include: { journal: { select: { title: true, issn: true, eissn: true, subject: true, publisherName: true } } }
        }),
        prisma2.article.count({ where })
      ]);
      res.json({ data, total, page: parseInt(page) || 1, limit: take });
    } catch (e2) {
      console.error("library articles:", e2);
      res.status(500).json({ error: "Failed to load articles" });
    }
  });
  app.get("/api/library/books", async (req, res) => {
    try {
      const { domain, search, page = "1", limit = "20" } = req.query;
      const where = { status: "Published" };
      applyDomainScope(where, domain, await libraryScopeDomains(req));
      if (search) where.title = { contains: search, mode: "insensitive" };
      const take = Math.min(parseInt(limit) || 20, 100);
      const skip = ((parseInt(page) || 1) - 1) * take;
      const [data, total] = await Promise.all([
        prisma2.book.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { chapters: true } }),
        prisma2.book.count({ where })
      ]);
      res.json({ data, total, page: parseInt(page) || 1, limit: take });
    } catch (e2) {
      res.status(500).json({ error: "Failed to load books" });
    }
  });
  const kindFor = (contentType) => contentType === "Books" ? "book" : "article";
  const buildAdminArticle = (b, createdBy) => ({
    contentType: b.contentType || "Periodicals",
    title: b.title || "Untitled",
    authors: b.authors || null,
    abstract: b.description || null,
    doi: b.doi || null,
    pdfUrl: b.fileUrl || b.pdfUrl || null,
    journalName: b.journalName || null,
    journalIssn: b.journalIssn || b.issn || null,
    publisherName: b.publisherName || null,
    volume: b.volume ? String(b.volume) : null,
    issue: b.issue ? String(b.issue) : null,
    year: b.year ? parseInt(b.year) : null,
    pages: b.pages || null,
    domain: b.domain || null,
    subject: b.subjectArea || b.subject || null,
    accessType: b.accessType || "OpenAccess",
    status: b.status || "Published",
    source: "Admin",
    ownershipSource: "AdminEntered",
    createdBy,
    metadata: { ...b.metadata || {}, tags: b.tags || [], thumbnailUrl: b.thumbnailUrl || null }
  });
  const buildAdminBook = (b, createdBy) => ({
    title: b.title || "Untitled",
    authors: b.authors || null,
    publisherName: b.publisherName || null,
    isbn: b.isbn || null,
    doi: b.doi || null,
    year: b.year ? parseInt(b.year) : null,
    edition: b.edition || null,
    pages: b.pages || null,
    subject: b.subjectArea || b.subject || null,
    domain: b.domain || null,
    description: b.description || null,
    coverUrl: b.thumbnailUrl || null,
    pdfUrl: b.fileUrl || b.pdfUrl || null,
    accessType: b.accessType || "OpenAccess",
    status: b.status || "Published",
    source: "Admin",
    ownershipSource: "AdminEntered",
    createdBy,
    metadata: { ...b.metadata || {}, tags: b.tags || [] }
  });
  const aliasItem = (row) => ({
    ...row,
    fileUrl: row.pdfUrl || row.fileUrl || null,
    thumbnailUrl: row.coverUrl || row.metadata?.thumbnailUrl || null,
    publishedAt: row.createdAt
  });
  app.get("/api/admin/library/items", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { contentType, search, domain, status, page = "1", limit = "15" } = req.query;
      const kind = kindFor(contentType);
      const take = Math.min(parseInt(limit) || 15, 1e5);
      const skip = ((parseInt(page) || 1) - 1) * take;
      const where = {};
      if (kind === "article") where.contentType = contentType;
      if (domain) where.domain = domain;
      if (status) where.status = status;
      if (search) where.OR = [{ title: { contains: search, mode: "insensitive" } }, { authors: { contains: search, mode: "insensitive" } }];
      const model = prisma2[kind];
      const [rows, total] = await Promise.all([
        model.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
        model.count({ where })
      ]);
      res.json({ data: rows.map(aliasItem), total, page: parseInt(page) || 1, limit: take });
    } catch (e2) {
      console.error("admin library list:", e2);
      res.status(500).json({ error: "Failed to load items" });
    }
  });
  app.get("/api/admin/library/items/:kind/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const kind = req.params.kind === "book" ? "book" : "article";
      const row = await prisma2[kind].findUnique({ where: { id: req.params.id }, ...kind === "book" ? { include: { chapters: true } } : {} });
      if (!row) return res.status(404).json({ error: "Not found" });
      res.json(aliasItem(row));
    } catch (e2) {
      res.status(500).json({ error: "Failed to load item" });
    }
  });
  app.post("/api/admin/library/items", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const by = req.user?.email || "Admin";
      const kind = kindFor(req.body.contentType);
      if (kind === "book") {
        const chapters = Array.isArray(req.body.chapters) ? req.body.chapters.filter((c) => c && c.title) : [];
        const book = await prisma2.book.create({
          data: {
            ...buildAdminBook(req.body, by),
            chapters: chapters.length ? { create: chapters.map((c, i2) => ({ title: c.title, authors: c.authors || null, pdfUrl: c.pdfUrl || null, pages: c.pages || null, chapterNumber: c.chapterNumber ? parseInt(c.chapterNumber) : i2 + 1, status: req.body.status || "Published" })) } : void 0
          }
        });
        return res.json(book);
      }
      const data = buildAdminArticle(req.body, by);
      const publisher = await upsertPublisherByName(data.publisherName, "Admin");
      const journal = await upsertJournalByIssn(data.journalIssn, {
        title: data.journalName || "Unknown Journal",
        publisherId: publisher?.id || null,
        publisherName: data.publisherName || null,
        domain: data.domain,
        subject: data.subject,
        openAccess: data.accessType === "OpenAccess",
        startYear: data.year || null
      });
      const article = await prisma2.article.create({ data: { ...data, publisherId: publisher?.id || null, journalId: journal?.id || null } });
      res.json(article);
    } catch (e2) {
      console.error("admin library create:", e2);
      res.status(500).json({ error: "Failed to create item" });
    }
  });
  app.post("/api/admin/library/items/bulk", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const by = req.user?.email || "Admin";
      const kind = kindFor(req.body.contentType);
      const rows = Array.isArray(req.body.items) ? req.body.items : [];
      if (!rows.length) return res.status(400).json({ error: "No rows to import" });
      let success = 0, failed = 0;
      const errors = [];
      const pubCache = /* @__PURE__ */ new Map();
      const jrnCache = /* @__PURE__ */ new Map();
      const getPub = async (name) => {
        if (!name) return null;
        if (pubCache.has(name)) return pubCache.get(name);
        const p = await upsertPublisherByName(name, "Admin");
        pubCache.set(name, p);
        return p;
      };
      const getJrn = async (issn, data) => {
        if (!issn) return await upsertJournalByIssn(issn, data);
        if (jrnCache.has(issn)) return jrnCache.get(issn);
        const j = await upsertJournalByIssn(issn, data);
        jrnCache.set(issn, j);
        return j;
      };
      for (let i2 = 0; i2 < rows.length; i2++) {
        const b = { ...rows[i2], contentType: req.body.contentType };
        try {
          if (!b.title || !String(b.title).trim()) throw new Error("Title is required");
          if (kind === "book") {
            await prisma2.book.create({ data: buildAdminBook(b, by) });
          } else {
            const data = buildAdminArticle(b, by);
            const publisher = await getPub(data.publisherName);
            const journal = await getJrn(data.journalIssn, {
              title: data.journalName || "Unknown Journal",
              publisherId: publisher?.id || null,
              publisherName: data.publisherName || null,
              domain: data.domain,
              subject: data.subject,
              openAccess: data.accessType === "OpenAccess",
              startYear: data.year || null
            });
            await prisma2.article.create({ data: { ...data, publisherId: publisher?.id || null, journalId: journal?.id || null } });
          }
          success++;
        } catch (e2) {
          failed++;
          errors.push({ row: i2 + 2, item: { title: b.title }, error: e2?.message || "Failed" });
        }
      }
      res.json({ success, failed, errors: errors.slice(0, 100) });
    } catch (e2) {
      console.error("admin library bulk:", e2);
      res.status(500).json({ error: "Bulk import failed" });
    }
  });
  app.put("/api/admin/library/items/:kind/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const kind = req.params.kind === "book" ? "book" : "article";
      const by = req.user?.email || "Admin";
      if (Object.keys(req.body).length === 1 && req.body.status) {
        const updated2 = await prisma2[kind].update({ where: { id: req.params.id }, data: { status: req.body.status } });
        return res.json(aliasItem(updated2));
      }
      const data = kind === "book" ? buildAdminBook(req.body, by) : buildAdminArticle(req.body, by);
      if (kind === "article") {
        const publisher = await upsertPublisherByName(data.publisherName, "Admin");
        const journal = await upsertJournalByIssn(data.journalIssn, {
          title: data.journalName || "Unknown Journal",
          publisherId: publisher?.id || null,
          publisherName: data.publisherName || null,
          domain: data.domain,
          subject: data.subject,
          openAccess: data.accessType === "OpenAccess",
          startYear: data.year || null
        });
        data.publisherId = publisher?.id || null;
        data.journalId = journal?.id || null;
      }
      const updated = await prisma2[kind].update({ where: { id: req.params.id }, data });
      if (kind === "book" && Array.isArray(req.body.chapters)) {
        await prisma2.chapter.deleteMany({ where: { bookId: req.params.id } });
        const chs = req.body.chapters.filter((c) => c && c.title);
        if (chs.length) await prisma2.chapter.createMany({ data: chs.map((c, i2) => ({ bookId: req.params.id, title: c.title, authors: c.authors || null, pdfUrl: c.pdfUrl || null, pages: c.pages || null, chapterNumber: c.chapterNumber ? parseInt(c.chapterNumber) : i2 + 1, status: req.body.status || "Published" })) });
      }
      res.json(aliasItem(updated));
    } catch (e2) {
      console.error("admin library update:", e2);
      res.status(500).json({ error: "Failed to update item" });
    }
  });
  app.delete("/api/admin/library/items/:kind/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const kind = req.params.kind === "book" ? "book" : "article";
      await prisma2[kind].delete({ where: { id: req.params.id } });
      res.json({ message: "Deleted" });
    } catch (e2) {
      res.status(500).json({ error: "Failed to delete item" });
    }
  });
  app.post("/api/admin/library/bulk", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { action, kind: k, ids } = req.body;
      const kind = k === "book" ? "book" : "article";
      if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: "No items" });
      const model = prisma2[kind];
      if (action === "Delete") {
        await model.deleteMany({ where: { id: { in: ids } } });
        return res.json({ message: `${ids.length} deleted` });
      }
      const status = action === "Publish" ? "Published" : "Draft";
      await model.updateMany({ where: { id: { in: ids } }, data: { status } });
      res.json({ message: `${ids.length} set to ${status}` });
    } catch (e2) {
      res.status(500).json({ error: "Bulk action failed" });
    }
  });
  app.get("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { domain, contentType, search, status, page = "1", limit = "10" } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const where = {};
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { authors: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } }
        ];
      }
      const [contents, total] = await Promise.all([
        prisma2.content.findMany({ where, skip, take: parseInt(limit), orderBy: { publishedAt: "desc" } }),
        prisma2.content.count({ where })
      ]);
      res.json({ data: contents, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
      console.error("Admin Content GET Error:", error);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  });
  app.post("/api/admin/content", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { title, description, authors, domain, contentType, subjectArea, fileUrl, thumbnailUrl, tags, price, accessType, status, publishingMode } = req.body;
      const newContent = await prisma2.content.create({
        data: { title, description, authors, domain, contentType, subjectArea, fileUrl, thumbnailUrl, tags, price: parseFloat(price) || 0, accessType, status, publishingMode: publishingMode || "Direct" }
      });
      res.json(newContent);
    } catch (error) {
      console.error("Admin Content POST Error:", error);
      res.status(500).json({ error: "Failed to create content" });
    }
  });
  app.get("/api/admin/content/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const content = await prisma2.content.findUnique({ where: { id } });
      if (!content) return res.status(404).json({ error: "Content not found" });
      res.json(content);
    } catch (error) {
      console.error("Admin Content GET Error:", error);
      res.status(500).json({ error: "Failed to fetch content details" });
    }
  });
  app.put("/api/admin/content/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      if (data.price !== void 0) data.price = parseFloat(data.price) || 0;
      const updatedContent = await prisma2.content.update({ where: { id }, data });
      res.json(updatedContent);
    } catch (error) {
      console.error("Admin Content PUT Error:", error);
      res.status(500).json({ error: "Failed to update content" });
    }
  });
  app.delete("/api/admin/content-drafts-cleanup", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { limit, domain, contentType } = req.query;
      let count = 0;
      const where = { status: "Draft" };
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
      if (limit && parseInt(limit) > 0) {
        const take = parseInt(limit);
        const drafts = await prisma2.content.findMany({
          where,
          select: { id: true },
          take
        });
        const ids = drafts.map((d) => d.id);
        if (ids.length > 0) {
          const result = await prisma2.content.deleteMany({ where: { id: { in: ids } } });
          count = result.count;
        }
      } else {
        const result = await prisma2.content.deleteMany({ where });
        count = result.count;
      }
      res.json({ success: true, count, message: `Deleted ${count} drafted items.` });
    } catch (error) {
      console.error("Admin Draft Cleanup Error:", error);
      res.status(500).json({ error: "Failed to clean up drafted content" });
    }
  });
  app.post("/api/admin/content-drafts-publish", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { limit, domain, contentType } = req.query;
      let count = 0;
      const where = { status: "Draft" };
      if (domain) where.domain = domain;
      if (contentType) where.contentType = contentType;
      if (limit && parseInt(limit) > 0) {
        const take = parseInt(limit);
        const drafts = await prisma2.content.findMany({
          where,
          select: { id: true },
          take
        });
        const ids = drafts.map((d) => d.id);
        if (ids.length > 0) {
          const result = await prisma2.content.updateMany({
            where: { id: { in: ids } },
            data: { status: "Published", validationStatus: null, flaggedReason: null }
          });
          count = result.count;
        }
      } else {
        const result = await prisma2.content.updateMany({
          where,
          data: { status: "Published", validationStatus: null, flaggedReason: null }
        });
        count = result.count;
      }
      res.json({ success: true, count, message: `Successfully published ${count} drafted items.` });
    } catch (error) {
      console.error("Admin Draft Publish Error:", error);
      res.status(500).json({ error: "Failed to publish drafted content" });
    }
  });
  app.delete("/api/admin/content/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await prisma2.content.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      console.error("Admin Content DELETE Error:", error);
      res.status(500).json({ error: "Failed to delete content" });
    }
  });
  app.post("/api/admin/content/bulk", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "Invalid payload format. Expected { items: [...] }" });
      }
      const generateFingerprint2 = (title, authors) => {
        const normalizedTitle = (title || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
        const normalizedAuthors = (authors || "").toLowerCase().replace(/[^a-z0-9\s,]/g, "").split(",").map((a) => a.trim()).sort().join(",");
        return import_crypto2.default.createHash("sha256").update(`${normalizedTitle}::${normalizedAuthors}`).digest("hex");
      };
      const results = { success: 0, failed: 0, skipped: 0, errors: [] };
      for (let i2 = 0; i2 < items.length; i2++) {
        const item = items[i2];
        try {
          if (!item.title || !item.authors) {
            results.failed++;
            results.errors.push({ row: i2 + 1, item, error: "Missing title or authors" });
            continue;
          }
          const fingerprint = generateFingerprint2(item.title, item.authors);
          const existing = await prisma2.content.findUnique({ where: { fingerprint } });
          if (existing) {
            results.skipped++;
            results.errors.push({ row: i2 + 1, item, error: "Duplicate content (fingerprint match)" });
            continue;
          }
          await prisma2.content.create({
            data: {
              title: item.title,
              description: item.description,
              authors: item.authors || "Unknown",
              domain: item.domain,
              contentType: item.contentType || "Book",
              subjectArea: item.subjectArea,
              fileUrl: item.fileUrl,
              thumbnailUrl: item.thumbnailUrl,
              tags: item.tags ? typeof item.tags === "string" ? item.tags.startsWith("[") ? JSON.parse(item.tags) : item.tags.split(",").map((t2) => t2.trim()) : item.tags : [],
              price: parseFloat(item.price) || 0,
              accessType: item.accessType || "Subscription",
              status: item.status || "Published",
              publishingMode: item.publishingMode || "Direct",
              fingerprint
            }
          });
          results.success++;
        } catch (err) {
          results.failed++;
          results.errors.push({ row: i2 + 1, item, error: err.message });
        }
      }
      res.json(results);
    } catch (error) {
      console.error("Bulk Import Error:", error);
      res.status(500).json({ error: "Failed to process bulk import" });
    }
  });
  app.post("/api/admin/content/bulk-action", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { action, contentIds } = req.body;
      if (!action || !Array.isArray(contentIds) || contentIds.length === 0) {
        return res.status(400).json({ error: "Invalid payload. Expected action and contentIds array." });
      }
      if (action === "Delete") {
        await prisma2.content.deleteMany({ where: { id: { in: contentIds } } });
      } else if (action === "Publish" || action === "Draft") {
        const statusVal = action === "Publish" ? "Published" : "Draft";
        await prisma2.content.updateMany({
          where: { id: { in: contentIds } },
          data: { status: statusVal }
        });
      } else {
        return res.status(400).json({ error: "Unknown action" });
      }
      res.json({ success: true, message: `Successfully applied ${action} to ${contentIds.length} items.` });
    } catch (err) {
      console.error("Bulk Action Error:", err);
      res.status(500).json({ error: err.message || "Failed to process bulk action" });
    }
  });
  app.post("/api/admin/users/:id/block", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body;
      const user = await prisma2.user.update({
        where: { id },
        data: { isBlocked: !!isBlocked }
      });
      res.json(user);
    } catch (error) {
      res.status(500).json({ error: "Failed to block/unblock user" });
    }
  });
  app.post("/api/admin/subscriptions/assign", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { userIds, bundleId, planType, durationMonths, domains: inputDomains, contentTypes: inputContentTypes } = req.body;
      let finalDomains = [];
      let finalContentTypes = [];
      let finalPlanName = "Custom Plan";
      if (bundleId) {
        const bundle = await prisma2.bundle.findUnique({ where: { id: bundleId } });
        if (!bundle) return res.status(404).json({ error: "Bundle not found" });
        finalDomains = Array.isArray(bundle.domains) ? bundle.domains : [];
        finalContentTypes = Array.isArray(bundle.contentTypes) ? bundle.contentTypes : [];
        finalPlanName = bundle.name;
      } else {
        finalDomains = Array.isArray(inputDomains) ? inputDomains : [inputDomains].filter(Boolean);
        finalContentTypes = Array.isArray(inputContentTypes) ? inputContentTypes : [inputContentTypes].filter(Boolean);
        if (finalDomains.length === 1) finalPlanName = `${finalDomains[0]} Plan`;
        else if (finalDomains.length > 1) finalPlanName = "Multi-Domain Plan";
      }
      if (!finalDomains.length || !finalContentTypes.length) {
        return res.status(400).json({ error: "At least one Domain and one Content Type must be provided or derived from a bundle." });
      }
      let dMonths = parseInt(durationMonths);
      if (isNaN(dMonths)) dMonths = 1;
      const startDate = /* @__PURE__ */ new Date();
      const endDate = new Date(startDate.getTime());
      endDate.setMonth(endDate.getMonth() + dMonths);
      const createdSubs = [];
      const targets = Array.isArray(userIds) ? userIds : [userIds].filter(Boolean);
      if (targets.length === 0) return res.status(400).json({ error: "No users selected" });
      for (const userId of targets) {
        const user = await prisma2.user.findUnique({ where: { id: userId } });
        const isInst = user?.role === "Institution";
        let assignedInstitutionId = null;
        if (isInst) {
          if (user.institutionId) {
            assignedInstitutionId = user.institutionId;
          } else {
            const inst = await prisma2.institution.findFirst({ where: { subscriptionId: userId } });
            if (inst) assignedInstitutionId = inst.id;
          }
        }
        const sub = await prisma2.subscription.create({
          data: {
            userId: isInst ? null : userId,
            institutionId: assignedInstitutionId,
            planName: finalPlanName,
            planType: planType || "Custom",
            durationMonths: dMonths,
            domains: finalDomains,
            contentTypes: finalContentTypes,
            startDate,
            endDate,
            status: "Active"
          }
        });
        createdSubs.push(sub);
      }
      res.json({ success: true, subscriptions: createdSubs });
    } catch (error) {
      console.error("Assign subscription error:", error);
      res.status(500).json({ error: error.message || "Failed to assign subscription" });
    }
  });
  app.get("/api/bundles", authenticateJWT, async (req, res) => {
    try {
      const bundles = await prisma2.bundle.findMany({
        where: { status: "Active" },
        orderBy: { name: "asc" }
      });
      res.json(bundles);
    } catch (error) {
      console.error("Fetch bundles error:", error);
      res.status(500).json({ error: "Failed to fetch bundles" });
    }
  });
  app.get("/api/admin/subscription-requests", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { status } = req.query;
      const where = {};
      if (status) where.status = status;
      const requests = await prisma2.subscriptionRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: true, subscription: true }
      });
      res.json(requests);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscription requests" });
    }
  });
  app.post("/api/admin/subscription-requests", async (req, res) => {
    try {
      const { userName, email, planType, durationMonths, planDescription, paymentRef, notes, userId } = req.body;
      const request = await prisma2.subscriptionRequest.create({
        data: { userName, email, planType, durationMonths: parseInt(durationMonths) || 1, planDescription, paymentRef, notes, userId }
      });
      res.json(request);
    } catch (error) {
      res.status(500).json({ error: "Failed to create subscription request" });
    }
  });
  app.post("/api/admin/subscription-requests/:id/approve", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.body;
      const requestObj = await prisma2.subscriptionRequest.findUnique({ where: { id } });
      if (!requestObj) return res.status(404).json({ error: "Request not found" });
      const start = startDate ? new Date(startDate) : /* @__PURE__ */ new Date();
      let end;
      if (endDate) {
        end = new Date(endDate);
      } else {
        end = new Date(start);
        end.setMonth(end.getMonth() + (requestObj.durationMonths || 1));
      }
      const subscription = await prisma2.subscription.create({
        data: {
          userId: requestObj.userId,
          planName: requestObj.planDescription || requestObj.planType,
          planType: requestObj.planType,
          durationMonths: requestObj.durationMonths,
          startDate: start,
          endDate: end,
          status: "Active",
          requestId: id
        }
      });
      await prisma2.subscriptionRequest.update({
        where: { id },
        data: { status: "Approved" }
      });
      res.json({ subscription, request: { ...requestObj, status: "Approved" } });
    } catch (error) {
      console.error("Approve subscription request error:", error);
      res.status(500).json({ error: error.message || "Failed to approve request" });
    }
  });
  app.post("/api/admin/subscription-requests/:id/reject", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { rejectionNote } = req.body;
      const updated = await prisma2.subscriptionRequest.update({
        where: { id },
        data: { status: "Rejected", rejectionNote }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to reject request" });
    }
  });
  app.get("/api/admin/payments", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const payments = await prisma2.payment.findMany({
        orderBy: { createdAt: "desc" },
        include: { user: true }
      });
      res.json(payments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });
  app.get("/api/admin/subscriptions", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { status } = req.query;
      const where = {};
      if (status) where.status = status;
      await prisma2.subscription.updateMany({
        where: { endDate: { lt: /* @__PURE__ */ new Date() }, status: "Active" },
        data: { status: "Expired" }
      });
      const subscriptions = await prisma2.subscription.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { user: true, request: true, institution: { include: { users: true } } }
      });
      res.json(subscriptions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });
  app.put("/api/admin/subscriptions/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, endDate, cancelledAt } = req.body;
      const data = {};
      if (status) data.status = status;
      if (endDate) data.endDate = new Date(endDate);
      if (status === "Cancelled") data.cancelledAt = /* @__PURE__ */ new Date();
      const updated = await prisma2.subscription.update({ where: { id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update subscription" });
    }
  });
  app.post("/api/payment/order", async (req, res) => {
    try {
      const { amount, currency = "INR", receipt } = req.body;
      if (process.env.NODE_ENV !== "production" && (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET)) {
        console.log("\u2139\uFE0F [Razorpay] Keys not configured. Falling back to local mock order...");
        return res.json({
          id: `order_mock_${Date.now()}`,
          amount: Math.round(amount * 100),
          currency,
          receipt,
          isMock: true
        });
      }
      const razorpay = getRazorpay();
      const options = {
        amount: Math.round(amount * 100),
        // amount in the smallest currency unit
        currency,
        receipt
      };
      const order = await razorpay.orders.create(options);
      res.json({
        ...order,
        razorpayKey: process.env.RAZORPAY_KEY_ID
      });
    } catch (error) {
      console.error("Razorpay Order Error:", error);
      res.status(500).json({ error: "Failed to create order" });
    }
  });
  app.post("/api/payment/verify", async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount, items, userId, guestData } = req.body;
      let isVerified = false;
      const isMockOrder = process.env.NODE_ENV !== "production" && razorpay_order_id && razorpay_order_id.startsWith("order_mock_");
      if (isMockOrder) {
        console.log("\u2705 [Razorpay] Mock Order verified automatically for local development.");
        isVerified = true;
      } else {
        const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
        const sign = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSign = import_crypto2.default.createHmac("sha256", keySecret).update(sign.toString()).digest("hex");
        isVerified = razorpay_signature === expectedSign;
        if (!isVerified) {
          console.warn(`\u26A0\uFE0F [Razorpay] Payment signature mismatch for Order: ${razorpay_order_id}`);
        }
      }
      if (isVerified) {
        let finalUserId = userId || null;
        let isNewUser = false;
        let generatedPassword = "";
        if (!finalUserId && guestData && guestData.email) {
          try {
            const existingUser = await prisma2.user.findUnique({ where: { email: guestData.email } });
            if (existingUser) {
              finalUserId = existingUser.id;
            } else {
              generatedPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + "!";
              const hashedPassword = await import_bcryptjs.default.hash(generatedPassword, 10);
              const newUser = await prisma2.user.create({
                data: {
                  email: guestData.email,
                  displayName: guestData.name || "New User",
                  password: hashedPassword,
                  role: guestData.userCategory === "Institution" || guestData.organization ? "Institution" : "Subscriber",
                  organization: guestData.organization || null,
                  status: "Active",
                  isFirstLogin: true
                }
              });
              finalUserId = newUser.id;
              isNewUser = true;
            }
          } catch (userErr) {
            console.error("Guest User Creation Error:", userErr);
          }
        }
        if (items && amount) {
          await prisma2.payment.create({
            data: {
              orderId: razorpay_order_id,
              paymentId: razorpay_payment_id,
              amount: parseFloat(amount),
              status: "Success",
              userId: finalUserId,
              items: items || []
            }
          });
          if (req.body.couponCode && req.body.discountAmount > 0) {
            const coupon = await prisma2.coupon.findUnique({ where: { code: req.body.couponCode } });
            if (coupon) {
              await prisma2.couponUsage.create({
                data: {
                  couponId: coupon.id,
                  userId: finalUserId,
                  orderId: razorpay_order_id,
                  discount: parseFloat(req.body.discountAmount)
                }
              });
              await prisma2.coupon.update({
                where: { id: coupon.id },
                data: { usedCount: { increment: 1 } }
              });
            }
          }
          let newInstitutionId = null;
          if (finalUserId) {
            const u = await prisma2.user.findUnique({ where: { id: finalUserId } });
            if (u && u.role === "Institution") {
              if (u.institutionId) {
                newInstitutionId = u.institutionId;
              } else {
                let inst = await prisma2.institution.findFirst({ where: { subscriptionId: u.id } });
                if (!inst && u.organization) {
                  inst = await prisma2.institution.create({
                    data: {
                      name: u.organization,
                      status: "Active",
                      subscriptionId: u.id
                    }
                  });
                  await prisma2.user.update({
                    where: { id: u.id },
                    data: { institutionId: inst.id }
                  });
                }
                newInstitutionId = inst?.id || null;
              }
            }
          }
          if (Array.isArray(items)) {
            for (const item of items) {
              const days = item.duration === "Yearly" ? 365 : item.duration === "Half-Yearly" ? 180 : item.duration === "Quarterly" ? 90 : 30;
              const endDate = new Date(Date.now() + days * 24 * 60 * 60 * 1e3);
              await prisma2.subscription.create({
                data: {
                  domainId: item.domainId ? String(item.domainId) : null,
                  domainName: item.domainName,
                  planName: item.planName || item.plan?.name || "Trial",
                  duration: item.duration || "Monthly",
                  status: "Active",
                  userId: finalUserId,
                  institutionId: newInstitutionId,
                  endDate
                }
              });
            }
          }
          if (isNewUser && guestData && guestData.email) {
            try {
              await sendCredentialsEmail(
                guestData.email,
                guestData.name || "New User",
                generatedPassword,
                {
                  planName: items[0]?.planName || "Purchased Subscription",
                  validity: items[0]?.duration || "Monthly"
                }
              );
            } catch (err) {
              console.error("Failed to send guest credentials email:", err);
            }
          }
          try {
            let targetEmail = guestData?.email || "";
            let targetName = guestData?.name || "Valued Customer";
            if (!targetEmail && finalUserId) {
              const dbUser = await prisma2.user.findUnique({ where: { id: finalUserId } });
              if (dbUser) {
                targetEmail = dbUser.email;
                targetName = dbUser.displayName || "Subscriber";
              }
            }
            const backendInvoiceNum = `INV-${(/* @__PURE__ */ new Date()).getFullYear()}-${Math.floor(1e5 + Math.random() * 9e5)}`;
            if (targetEmail) {
              sendPaymentSuccessEmails(
                targetEmail,
                targetName,
                parseFloat(amount).toFixed(2),
                items || [],
                razorpay_payment_id || "",
                razorpay_order_id || "",
                backendInvoiceNum
              ).catch((err) => console.error("\u26A0\uFE0F Auto-payment success email trigger failed:", err));
            }
          } catch (emailSendErr) {
            console.error("Failed to trigger automated receipt notification:", emailSendErr);
          }
        }
        res.json({ status: "success", message: "Payment verified successfully" });
      } else {
        res.status(400).json({ status: "failure", message: "Invalid signature" });
      }
    } catch (error) {
      console.error("Payment Verification Error:", error);
      if (!res.headersSent) {
        res.status(500).json({ status: "error", message: "Payment verification failed" });
      }
    }
  });
  app.get("/api/debug-version", (req, res) => {
    res.json({ version: "1.0.1", status: "New UI deployed!" });
  });
  app.post("/api/demo-request", async (req, res) => {
    try {
      const formData = req.body;
      const {
        fullName,
        institutionalEmail,
        institutionName,
        designation,
        whatsappNumber,
        city,
        state,
        department,
        requestType
      } = formData;
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      await prisma2.demoRequest.create({
        data: {
          fullName,
          institutionalEmail,
          institutionName,
          designation,
          whatsappNumber,
          city,
          state,
          department,
          requestType: requestType || "Institution"
        }
      });
      try {
        await prisma2.lead.create({
          data: {
            name: fullName,
            email: institutionalEmail,
            phone: whatsappNumber,
            organization: institutionName,
            state: state || null,
            source: "Demo Request",
            status: "All",
            notes: `Requested Demo Type: ${requestType || "Institution"}`
          }
        });
      } catch (e2) {
        console.error("Failed to auto-create lead for demo request", e2);
      }
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: `New ${requestType || "Demo"} Session Request: ${institutionName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F3AF} New Demo Session Request (${requestType || "Institution"})</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">A user has requested a personalized demo of the platform.</p><table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;"><tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Request Details</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Type</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#2563eb;border-bottom:1px solid #f1f5f9;">${requestType || "Institution"}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${fullName}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${institutionalEmail}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Organization / Inst.</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${institutionName}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">WhatsApp</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${whatsappNumber || "N/A"}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Department / Tech</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${department}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Location</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${city}, ${state}</td></tr></table></td></tr>`
        )
      };
      const userMailOptions = {
        from: emailFrom,
        to: institutionalEmail,
        subject: "Your Demo Session Request has been received",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F44B} Demo Request Received!</p><p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${fullName}</strong>, thank you for showing interest in a personalized demo. Our team will contact you within 24 hours to schedule a convenient walkthrough of the platform.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F550} Next Steps</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">1</span>&nbsp; Our experts review your request details</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">2</span>&nbsp; We reach out via email/WhatsApp to fix a slot</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">3</span>&nbsp; A guided platform tour tailored for your needs</p></td></tr></table><p style="font-size:12px;color:#64748b;margin:0;">Need immediate assistance? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a></p></td></tr>`
        )
      };
      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);
      res.json({ status: "success", message: "Demo request submitted successfully" });
    } catch (error) {
      console.error("Demo Request Error:", error);
      res.status(500).json({ error: "Failed to submit demo request" });
    }
  });
  app.get("/api/admin/demo-requests", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const requests = await prisma2.demoRequest.findMany({
        orderBy: { createdAt: "desc" }
      });
      const verifications = await prisma2.emailVerification.findMany();
      const verifiedEmails = new Set(verifications.filter((v) => v.isVerified).map((v) => v.email));
      const enhancedRequests = requests.map((req2) => ({
        ...req2,
        isEmailVerified: verifiedEmails.has(req2.institutionalEmail)
      }));
      res.json(enhancedRequests);
    } catch (error) {
      console.error("Failed to fetch demo requests:", error);
      res.status(500).json({ error: "Failed to fetch demo requests" });
    }
  });
  app.patch("/api/admin/demo-requests/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, adminNotes } = req.body;
      const updated = await prisma2.demoRequest.update({
        where: { id },
        data: { status, adminNotes }
      });
      res.json(updated);
    } catch (error) {
      console.error("Failed to update demo request:", error);
      res.status(500).json({ error: "Failed to update demo request" });
    }
  });
  app.post("/api/admin/demo-requests/:id/provision", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const { durationDays } = req.body;
      const days = Number(durationDays) || 14;
      const demoReq = await prisma2.demoRequest.findUnique({ where: { id } });
      if (!demoReq) return res.status(404).json({ error: "Demo request not found" });
      const existingUser = await prisma2.user.findUnique({ where: { email: demoReq.institutionalEmail } });
      if (existingUser) return res.status(400).json({ error: "User with this email already exists. Cannot auto-provision." });
      const plainPassword = generatePassword();
      const hashedPassword = await import_bcryptjs.default.hash(plainPassword, 10);
      const isStudent = demoReq.requestType === "Student";
      const targetRole = isStudent ? "Subscriber" : "Institution";
      let newInstId = void 0;
      if (!isStudent) {
        const newInst = await prisma2.institution.create({
          data: { name: demoReq.institutionName, status: "Active" }
        });
        newInstId = newInst.id;
      }
      const newUser = await prisma2.user.create({
        data: {
          email: demoReq.institutionalEmail,
          password: hashedPassword,
          displayName: demoReq.fullName,
          role: targetRole,
          status: "Active",
          isFirstLogin: true,
          organization: demoReq.institutionName,
          institutionId: newInstId,
          isDemoAccount: true,
          demoExpiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1e3)
        }
      });
      await prisma2.subscription.create({
        data: {
          domainName: demoReq.department,
          planName: `${demoReq.requestType || "Demo"} Trial`,
          durationMonths: 1,
          status: "Active",
          userId: newUser.id,
          institutionId: newInstId,
          endDate: new Date(Date.now() + days * 24 * 60 * 60 * 1e3)
        }
      });
      await sendCredentialsEmail(
        demoReq.institutionalEmail,
        demoReq.fullName,
        plainPassword,
        {
          institution: demoReq.institutionName,
          department: demoReq.department,
          planName: "Demo Access Trial",
          validity: `${days} Days`,
          customMessage: `We are delighted to inform you that your <strong>Demo Request has been accepted</strong>. Your temporary trial access has been <span style="color:#16A34A;font-weight:700;">successfully provisioned</span> for your requested department.`
        }
      );
      const updated = await prisma2.demoRequest.update({
        where: { id },
        data: {
          status: "Completed",
          adminNotes: (demoReq.adminNotes ? demoReq.adminNotes + "\n\n" : "") + `[AUTO] Provisioned ${days}-day demo access on ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`
        }
      });
      res.json({ success: true, request: updated });
    } catch (error) {
      console.error("Failed to provision demo:", error);
      res.status(500).json({ error: "Failed to provision demo account" });
    }
  });
  app.post("/api/admin/demo-requests/:id/resend-credentials", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { id } = req.params;
      const demoReq = await prisma2.demoRequest.findUnique({ where: { id } });
      if (!demoReq) return res.status(404).json({ error: "Demo request not found" });
      const userObj = await prisma2.user.findUnique({ where: { email: demoReq.institutionalEmail } });
      if (!userObj) return res.status(404).json({ error: "No associated user account found for this email." });
      const plainPassword = generatePassword();
      const hashedPassword = await import_bcryptjs.default.hash(plainPassword, 10);
      await prisma2.user.update({
        where: { id: userObj.id },
        data: {
          password: hashedPassword,
          isFirstLogin: true
        }
      });
      await sendCredentialsEmail(
        demoReq.institutionalEmail,
        demoReq.fullName,
        plainPassword,
        {
          institution: demoReq.institutionName,
          department: demoReq.department,
          planName: "Demo Access Trial",
          validity: userObj.demoExpiresAt ? `${Math.ceil((userObj.demoExpiresAt.getTime() - Date.now()) / (1e3 * 60 * 60 * 24))} Days remaining` : "N/A",
          customMessage: `As requested, we have <strong>reset your Demo Access credentials</strong>. Your access has been refreshed and updated.`
        }
      );
      const updated = await prisma2.demoRequest.update({
        where: { id },
        data: {
          adminNotes: (demoReq.adminNotes ? demoReq.adminNotes + "\n\n" : "") + `[AUTO] Credentials reset and resent on ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}`
        }
      });
      res.json({ success: true, request: updated });
    } catch (error) {
      console.error("Failed to resend credentials:", error);
      res.status(500).json({ error: "Failed to resend credentials" });
    }
  });
  app.post("/api/institutional-trial", async (req, res) => {
    try {
      const formData = req.body;
      const {
        fullName,
        institutionalEmail,
        institutionName,
        designation,
        whatsappNumber,
        pincode,
        city,
        state,
        country,
        fullAddress,
        department
      } = formData;
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: `New Institutional Trial Request: ${institutionName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F3DB}\uFE0F New Institutional Trial Request</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">An institution has requested a trial access through the website.</p><table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;"><tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Personal Details</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:38%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${fullName}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${institutionalEmail}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Designation</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${designation || "N/A"}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">WhatsApp</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${whatsappNumber || "N/A"}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Institution</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${institutionName}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Department</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${department}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">City / State</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${city}, ${state}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Country</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${country}</td></tr></table></td></tr>`
        )
      };
      const userMailOptions = {
        from: emailFrom,
        to: institutionalEmail,
        subject: "Your Institutional Trial Request has been received",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F3DB}\uFE0F Trial Request Received!</p><p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${fullName}</strong>, thank you for requesting an institutional trial for <strong>${institutionName}</strong> \u2014 <strong>${department}</strong>. Our team is reviewing your request and will get in touch shortly to set up the access.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="color:#15803d;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F550} What Happens Next?</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">1</span>&nbsp; Our institutional access team verifies your details</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">2</span>&nbsp; We discuss IP-based or remote access setup</p><p style="margin:5px 0;font-size:13px;color:#1e293b;"><span style="background:#15803d;color:#fff;font-size:10px;font-weight:700;border-radius:50%;padding:2px 6px;">3</span>&nbsp; Your institution gets seamless trial access</p></td></tr></table><p style="font-size:12px;color:#64748b;margin:0;">Questions? Email <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a> or call <strong>+91-120-4781200</strong></p></td></tr>`
        )
      };
      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);
      res.json({ status: "success", message: "Trial request submitted successfully" });
    } catch (error) {
      console.error("Institutional Trial Error:", error);
      res.status(500).json({ error: "Failed to submit trial request" });
    }
  });
  app.post("/api/contact", async (req, res) => {
    try {
      const formData = req.body;
      const {
        fullName,
        email,
        mobile,
        whatsapp,
        designation,
        departments,
        state,
        organization,
        message
      } = formData;
      try {
        await prisma2.contactInquiry.create({
          data: {
            fullName,
            email,
            mobile: mobile || null,
            whatsapp: whatsapp || null,
            designation: designation || null,
            departments: Array.isArray(departments) ? departments : departments ? [departments] : [],
            state: state || null,
            organization: organization || null,
            message,
            status: "All"
          }
        });
        await prisma2.lead.create({
          data: {
            name: fullName,
            email,
            phone: mobile || whatsapp || null,
            organization: organization || null,
            state: state || null,
            source: "Contact Inquiry",
            status: "All",
            notes: message
          }
        });
      } catch (dbErr) {
        console.error("Failed to save contact inquiry to DB:", dbErr);
      }
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: emailFrom,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: "New Contact Inquiry from Website",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F4E9} New Contact Inquiry</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">A new inquiry was submitted via the website contact form.</p><table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;"><tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Inquiry Details</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Full Name</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e293b;border-bottom:1px solid #f1f5f9;">${fullName}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Mobile</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${mobile || "N/A"}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Organization</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${organization || "N/A"}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Designation</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${designation || "N/A"}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">State</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${state || "N/A"}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Departments</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;">${Array.isArray(departments) ? departments.join(", ") : departments || "N/A"}</td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;"><tr><td style="padding:16px 20px;"><p style="color:#0369a1;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">\u{1F4AC} Message</p><p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">${message}</p></td></tr></table></td></tr>`
        )
      };
      const userMailOptions = {
        from: emailFrom,
        to: email,
        subject: "Thank you for contacting STM Digital Library",
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u2705 We've Got Your Message!</p><p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${fullName}</strong>, thank you for contacting <strong>STM Digital Library</strong>. We have received your inquiry and our team will get back to you within <strong>1\u20132 business days</strong>.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:10px;border:1px solid #bae6fd;margin-bottom:16px;"><tr><td style="padding:16px 20px;"><p style="color:#0369a1;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 8px;">\u{1F4AC} Your Message</p><p style="font-size:13px;color:#1e293b;line-height:1.6;margin:0;">${message}</p></td></tr></table>` + (departments && (Array.isArray(departments) ? departments.length > 0 : true) ? `<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:10px;border:1px solid #ddd6fe;margin-bottom:16px;"><tr><td style="padding:16px 20px;"><p style="color:#7e22ce;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F4DA} Selected Departments</p>` + (Array.isArray(departments) ? departments : [departments]).map(
            (d) => `<span style="display:inline-block;background:#ede9fe;color:#6d28d9;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;margin:3px 4px 3px 0;">${d}</span>`
          ).join("") + `</td></tr></table>` : "") + `<table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:18px;"><tr><td style="padding:18px 20px;"><p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F4DE} Reach Us Directly</p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;">\u{1F4E7} <a href="mailto:info@celnet.in" style="color:#93c5fd;">info@celnet.in</a></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;">\u{1F4DE} +91-120-4781200</p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;">\u{1F310} <a href="https://journalslibrary.com" style="color:#93c5fd;">journalslibrary.com</a></p></td></tr></table></td></tr>`
        )
      };
      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);
      res.json({ status: "success", message: "Inquiry submitted successfully" });
    } catch (error) {
      console.error("Contact Form Error:", error);
      res.status(500).json({ error: "Failed to submit inquiry" });
    }
  });
  app.get("/api/admin/contact-inquiries", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { status, search } = req.query;
      const where = {};
      if (status && status !== "All") where.status = status;
      if (search) {
        where.OR = [
          { fullName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { organization: { contains: search, mode: "insensitive" } },
          { message: { contains: search, mode: "insensitive" } }
        ];
      }
      const inquiries = await prisma2.contactInquiry.findMany({
        where,
        orderBy: { createdAt: "desc" }
      });
      res.json(inquiries);
    } catch (error) {
      console.error("GET contact-inquiries error:", error);
      res.status(500).json({ error: "Failed to fetch contact inquiries" });
    }
  });
  app.get("/api/admin/contact-inquiries/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const inquiry = await prisma2.contactInquiry.findUnique({ where: { id: req.params.id } });
      if (!inquiry) return res.status(404).json({ error: "Not found" });
      if (inquiry.status === "New") {
        await prisma2.contactInquiry.update({ where: { id: req.params.id }, data: { status: "Read" } });
        inquiry.status = "Read";
      }
      res.json(inquiry);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiry" });
    }
  });
  app.put("/api/admin/contact-inquiries/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const data = {};
      if (status) data.status = status;
      if (adminNotes !== void 0) data.adminNotes = adminNotes;
      const updated = await prisma2.contactInquiry.update({ where: { id: req.params.id }, data });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update inquiry" });
    }
  });
  app.post("/api/admin/contact-inquiries/:id/reply", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { replyText, subject } = req.body;
      const inquiry = await prisma2.contactInquiry.findUnique({ where: { id: req.params.id } });
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      await sendMail({
        from: `"STM Digital Library" <${emailFrom}>`,
        to: inquiry.email,
        subject: subject || `Re: Your Contact Inquiry \u2013 STM Digital Library`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #1e293b;">
            <div style="background: #1e293b; padding: 28px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #fff; margin: 0; font-size: 20px;">STM Digital Library</h1>
              <p style="color: #94a3b8; margin: 4px 0 0; font-size: 13px;">Response to your enquiry</p>
            </div>
            <div style="background: #fff; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; padding: 32px;">
              <p style="margin: 0 0 16px; font-size: 15px;">Dear <strong>${inquiry.fullName}</strong>,</p>
              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.7;">${replyText.replace(/\n/g, "<br/>")}</p>
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #64748b;">
                  For further assistance, please reply to this email or call us at <strong>+91-120-4781200</strong>.<br/>
                  <strong>STM Digital Library</strong> | info@celnet.in
                </p>
              </div>
            </div>
          </div>
        `
      });
      const updated = await prisma2.contactInquiry.update({
        where: { id: req.params.id },
        data: { status: "Replied", replyText, repliedAt: /* @__PURE__ */ new Date() }
      });
      res.json({ success: true, inquiry: updated });
    } catch (error) {
      console.error("Reply contact inquiry error:", error);
      res.status(500).json({ error: "Failed to send reply" });
    }
  });
  app.delete("/api/admin/contact-inquiries/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      await prisma2.contactInquiry.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete inquiry" });
    }
  });
  app.get("/api/quotation/customer/:email", async (req, res) => {
    try {
      const email = req.params.email;
      const q = await prisma2.quotation.findFirst({
        where: { userEmail: email },
        orderBy: { createdAt: "desc" }
      });
      if (q) {
        res.json(q);
      } else {
        res.status(404).json({ error: "Not found" });
      }
    } catch (err) {
      res.status(500).json({ error: "Failed" });
    }
  });
  app.post("/api/quotation/save", async (req, res) => {
    try {
      const { userEmail, userName, quotationData, userId, organization, state, duration } = req.body;
      let creatorEmail = "User / System";
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const token = authHeader.split(" ")[1];
          const JWT_SECRET2 = process.env.JWT_SECRET || "fallback_secret";
          const decoded = import_jsonwebtoken.default.verify(token, JWT_SECRET2);
          if (decoded && decoded.email) creatorEmail = decoded.email;
        } catch (e2) {
        }
      }
      const quotationNumber = quotationData.quotationNumber;
      await prisma2.quotation.upsert({
        where: { id: quotationNumber },
        update: {
          status: "Downloaded",
          deliveryMethod: "Download",
          planType: duration,
          createdBy: creatorEmail,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null
        },
        create: {
          id: quotationNumber,
          userEmail,
          userName,
          organization: organization || null,
          state: state || null,
          items: quotationData.items || [],
          subtotal: parseFloat(quotationData.subtotal) || 0,
          gstAmount: parseFloat(quotationData.gstAmount) || 0,
          total: parseFloat(quotationData.totalAmount?.toString().replace(/,/g, "")) || 0,
          status: "Downloaded",
          deliveryMethod: "Download",
          planType: duration,
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
          createdBy: creatorEmail,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null
        }
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Save Quotation Error:", error);
      res.status(500).json({ error: "Failed to save quotation" });
    }
  });
  app.post("/api/quotation/send", async (req, res) => {
    try {
      const { userEmail, userName, quotationData, pdfBase64, userId, organization, state, duration, quotationDate } = req.body;
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const quotationNumber = quotationData.quotationNumber;
      const totalAmount = typeof quotationData.totalAmount === "number" ? quotationData.totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : quotationData.totalAmount || "0";
      const logoPath = import_path2.default.join(process.cwd(), "public", "assets", "stm-logo.png");
      const logoExists = import_fs2.default.existsSync(logoPath);
      const items = quotationData.items || [];
      const departmentNames = items.map((it) => it.domainName).filter(Boolean);
      const departmentsHtml = departmentNames.length ? departmentNames.map((d) => `<li style="padding:4px 0;color:#1e293b;font-size:14px;">\u2705 &nbsp;${d}</li>`).join("") : '<li style="color:#94a3b8;font-size:14px;">\u2014</li>';
      const issuedDate = quotationDate || (/* @__PURE__ */ new Date()).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      const subscriptionDuration = duration || items[0]?.duration || "\u2014";
      const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Quotation \u2014 STM Digital Library</title>
</head>
<body style="margin:0;padding:0;background-color:#eef2f7;font-family:'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#eef2f7;padding:32px 0;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.10);max-width:620px;">

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 HEADER \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:32px 48px 28px;text-align:center;">
            ${logoExists ? `<img src="cid:stm-logo" alt="STM Digital Library" width="110" height="110" style="display:block;margin:0 auto 16px;border-radius:12px;" />` : `<div style="display:inline-block;background:#2563eb;border-radius:12px;padding:10px 22px;margin-bottom:16px;"><span style="color:#ffffff;font-size:18px;font-weight:900;letter-spacing:3px;">STM</span></div>`}
            <h1 style="color:#ffffff;margin:0 0 6px;font-size:26px;font-weight:900;letter-spacing:1px;line-height:1.2;">STM DIGITAL LIBRARY</h1>
            <p style="color:#93c5fd;margin:0 0 16px;font-size:13px;font-weight:500;letter-spacing:0.5px;">A Division of Consortium eLearning Network Pvt. Ltd.</p>
            <span style="display:inline-block;background:#15803d;color:#ffffff;font-size:11px;font-weight:700;border-radius:30px;padding:6px 20px;letter-spacing:1px;">
              \u{1F3C6} &nbsp;21 Years of Trusted Excellence in Education &amp; Academic Publishing
            </span>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 GREETING \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="padding:36px 48px 0;">
            <p style="font-size:16px;color:#1e293b;margin:0 0 6px;font-weight:600;">Dear ${userName},</p>
            <p style="font-size:14px;color:#475569;line-height:1.75;margin:0 0 20px;">
              Greetings from <strong>STM Digital Library</strong>!<br/>
              Thank you for your interest in our digital library subscription services.<br/>
              Please find attached the quotation for the selected department(s) and subscription duration.
            </p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 28px;"/>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 QUOTATION DETAILS \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#1d4ed8,#1e40af);border-radius:14px;overflow:hidden;">
              <tr>
                <td style="padding:20px 28px 10px;">
                  <p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;margin:0 0 18px;">\u{1F4C4} &nbsp;Quotation Details</p>

                  <!-- Row -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);width:55%;">Quotation Number</td>
                      <td style="color:#ffffff;font-size:13px;font-weight:700;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${quotationNumber}</td>
                    </tr>
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Quotation Date</td>
                      <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${issuedDate}</td>
                    </tr>
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Subscription Validity</td>
                      <td style="color:#86efac;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">30 Days from Issue</td>
                    </tr>
                    <tr>
                      <td style="color:#93c5fd;font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">Subscription Duration</td>
                      <td style="color:#ffffff;font-size:13px;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);">${subscriptionDuration}</td>
                    </tr>
                  </table>

                  <!-- Departments -->
                  <p style="color:#93c5fd;font-size:12px;margin:14px 0 6px;">Selected Department(s)</p>
                  <ul style="margin:0 0 14px;padding-left:4px;list-style:none;">
                    ${departmentsHtml}
                  </ul>
                  ${quotationData.discountAmount ? `
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                    <tr>
                      <td style="color:#86efac;font-size:13px;font-weight:600;padding-bottom:6px;">Discount (${quotationData.couponCode})</td>
                      <td style="text-align:right;color:#86efac;font-size:13px;font-weight:700;padding-bottom:6px;">-\u20B9${quotationData.discountAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  </table>
                  ` : ""}

                  <!-- Grand Total -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid rgba(255,255,255,0.25);padding-top:14px;margin-top:4px;">
                    <tr>
                      <td style="color:#bfdbfe;font-size:13px;font-weight:600;padding-top:14px;">Total Amount (Including 18% GST)</td>
                      <td style="text-align:right;padding-top:14px;">
                        <span style="color:#ffffff;font-size:22px;font-weight:900;">\u20B9${totalAmount}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ABOUT STM \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f9ff;border-radius:14px;border:1px solid #bae6fd;">
              <tr>
                <td style="padding:22px 28px;">
                  <p style="color:#0369a1;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">\u{1F4DA} &nbsp;About STM Digital Library</p>
                  <p style="color:#475569;font-size:13px;margin:0 0 12px;line-height:1.7;">STM Digital Library is a curated academic platform providing access to:</p>
                  <table cellpadding="0" cellspacing="0">
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">\u2726 &nbsp;Academic Journals</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">\u2726 &nbsp;Conference Proceedings</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">\u2726 &nbsp;Educational Videos</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">\u2726 &nbsp;E-books &amp; Reference Materials</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">\u2726 &nbsp;Theses &amp; Research Content</td></tr>
                    <tr><td style="padding:3px 0;color:#1e293b;font-size:13px;">\u2726 &nbsp;Legally sourced open-access academic resources</td></tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 PAYMENT INFO \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border-radius:14px;border:1px solid #fde68a;">
              <tr>
                <td style="padding:22px 28px;">
                  <p style="color:#92400e;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">\u{1F4B3} &nbsp;Payment Information</p>
                  <p style="color:#78350f;font-size:13px;font-weight:600;margin:0 0 12px;">Payments must be made only to:</p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;width:45%;">Account Name</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">Consortium eLearning Network Pvt. Ltd.</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Account Number</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">03942000001153</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Bank Name</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;border-bottom:1px solid #fde68a;">HDFC Bank</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;border-bottom:1px solid #fde68a;">Branch</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:600;padding:5px 0;border-bottom:1px solid #fde68a;">Sector-62, Noida, U.P., India</td>
                    </tr>
                    <tr>
                      <td style="color:#92400e;font-size:12px;padding:5px 0;">IFSC Code</td>
                      <td style="color:#1e293b;font-size:13px;font-weight:700;padding:5px 0;">HDFC0002649</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 CONTACT INFO \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:14px;border:1px solid #bbf7d0;">
              <tr>
                <td style="padding:22px 28px;">
                  <p style="color:#15803d;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 14px;">\u{1F4DE} &nbsp;Contact Information</p>
                  <p style="color:#166534;font-size:13px;font-weight:500;margin:0 0 10px;">For any assistance regarding subscription, quotation, or payment:</p>
                  <table cellpadding="0" cellspacing="4">
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#1e293b;">
                        \u{1F4E7} &nbsp;<a href="mailto:info@celnet.in" style="color:#2563eb;text-decoration:none;font-weight:600;">info@celnet.in</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#1e293b;">
                        \u{1F4DE} &nbsp;<a href="tel:+919810078958" style="color:#1e293b;text-decoration:none;font-weight:600;">+91-9810078958</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;font-size:13px;color:#1e293b;">
                        \u{1F310} &nbsp;<a href="https://journalslibrary.com/" style="color:#2563eb;text-decoration:none;font-weight:600;">journalslibrary.com</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 SIGNATURE \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="padding:0 48px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #e2e8f0;padding-top:24px;">
              <tr>
                <td style="padding-top:20px;">
                  <p style="color:#475569;font-size:14px;margin:0 0 4px;">Warm regards,</p>
                  <p style="color:#1e293b;font-size:15px;font-weight:700;margin:0 0 2px;">STM Digital Library Team</p>
                  <p style="color:#64748b;font-size:12px;margin:0;">Consortium eLearning Network Pvt. Ltd.</p>
                  <p style="color:#64748b;font-size:12px;margin:4px 0 0;">A-118, 1st Floor, Sector-63, Noida - 201301, U.P., India</p>
                </td>
                <td style="text-align:right;vertical-align:bottom;padding-top:20px;">
                  <p style="color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin:0 0 4px;">For Publisher</p>
                  <p style="color:#1e293b;font-size:13px;font-weight:700;margin:0 0 4px;">STM Digital Library</p>
                  <p style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:0;">Authorized Signatory</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 FOOTER \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 -->
        <tr>
          <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a6e 100%);padding:28px 48px;text-align:center;">
            <p style="color:#f8fafc;font-size:13px;font-weight:700;margin:0 0 6px;letter-spacing:0.5px;">
              \u{1F3C6} &nbsp;21 Years of Trusted Excellence in Education &amp; Academic Publishing
            </p>
            <p style="color:#64748b;font-size:11px;margin:0 0 4px;">
              \xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} Consortium eLearning Network Pvt. Ltd. All rights reserved.
            </p>
            <p style="color:#475569;font-size:11px;margin:0;">
              GSTIN: 09AACCC6494M1Z1 &nbsp;|&nbsp; PAN: AACCC6494M &nbsp;|&nbsp; CIN: U80302DL2005PTC138759
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
      const inlineAttachments = [
        {
          filename: `Quotation_${quotationNumber}.pdf`,
          content: pdfBase64,
          encoding: "base64"
        }
      ];
      if (logoExists) {
        inlineAttachments.push({
          filename: "stm-logo.png",
          path: logoPath,
          cid: "stm-logo"
          // Referenced as cid:stm-logo in the HTML
        });
      }
      const mailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: [userEmail, process.env.ADMIN_EMAIL || "info@celnet.in"],
        subject: `Quotation ${quotationNumber} \u2014 STM Digital Library`,
        html: htmlBody,
        attachments: inlineAttachments
      };
      await sendMail(mailOptions);
      res.json({ status: "success", message: "Quotation sent successfully" });
      let creatorEmail = req.body.createdBy || "System / Guest";
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split(" ")[1];
        try {
          const jwt2 = require("jsonwebtoken");
          const JWT_SECRET2 = process.env.JWT_SECRET || "fallback_secret";
          const decoded = jwt2.verify(token, JWT_SECRET2);
          if (decoded && decoded.email) creatorEmail = decoded.email;
        } catch (e2) {
        }
      }
      const PUBLIC_BASE = process.env.APP_URL || "https://journals.stmjournals.com";
      const htmlForDb = htmlBody.replace(
        /src="cid:stm-logo"/g,
        `src="${PUBLIC_BASE}/assets/stm-logo.png"`
      );
      prisma2.quotation.upsert({
        where: { id: quotationNumber },
        update: {
          status: "Sent",
          deliveryMethod: "Email",
          sentEmailHtml: htmlForDb,
          planType: subscriptionDuration,
          createdBy: creatorEmail,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null
        },
        create: {
          id: quotationNumber,
          userEmail,
          userName,
          organization: organization || null,
          state: state || null,
          items: quotationData.items || [],
          subtotal: parseFloat(quotationData.subtotal) || 0,
          gstAmount: parseFloat(quotationData.gstAmount) || 0,
          total: parseFloat(quotationData.totalAmount?.toString().replace(/,/g, "")) || 0,
          status: "Sent",
          deliveryMethod: "Email",
          planType: subscriptionDuration,
          userId: userId || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1e3),
          sentEmailHtml: htmlForDb,
          createdBy: creatorEmail,
          discountAmount: quotationData.discountAmount ? parseFloat(quotationData.discountAmount) : 0,
          couponCode: quotationData.couponCode || null,
          mobile: quotationData.mobile || null,
          designation: quotationData.designation || null,
          address: quotationData.address || null,
          pincode: quotationData.pincode || null,
          city: quotationData.city || null,
          country: quotationData.country || null,
          gstNumber: quotationData.gstNumber || null,
          userCategory: quotationData.userCategory || null
        }
      }).then(async (qtn) => {
        if (quotationData.couponCode && quotationData.discountAmount > 0) {
          const coupon = await prisma2.coupon.findUnique({ where: { code: quotationData.couponCode } });
          if (coupon) {
            await prisma2.couponUsage.create({
              data: {
                couponId: coupon.id,
                userId: userId || null,
                orderId: quotationNumber,
                discount: parseFloat(quotationData.discountAmount)
              }
            });
            await prisma2.coupon.update({
              where: { id: coupon.id },
              data: { usedCount: { increment: 1 } }
            });
          }
        }
      }).catch((dbErr) => {
        console.warn("Quotation DB save failed (non-blocking):", dbErr?.message);
      });
    } catch (error) {
      console.error("Quotation Email Error:", error);
      res.status(500).json({ error: "Failed to send quotation email" });
    }
  });
  app.post("/api/invoice/send", async (req, res) => {
    try {
      const { userEmail, userName, invoiceData, pdfBase64, items, paymentId, orderId } = req.body;
      const emailSent = await sendPaymentSuccessEmails(
        userEmail,
        userName,
        invoiceData.grandTotal,
        items || [],
        paymentId || "",
        orderId || "",
        invoiceData.invoiceNumber,
        pdfBase64
      );
      if (emailSent) {
        res.json({ status: "success", message: "Invoice sent successfully" });
      } else {
        res.status(500).json({ error: "Failed to send email notifications" });
      }
    } catch (error) {
      console.error("Invoice Email Error:", error);
      res.status(500).json({ error: "Failed to send invoice email" });
    }
  });
  app.get("/api/institution/stats", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === "Institution") {
        const userId = req.user.uid || req.user.id || req.user.userId;
        const authUser = await prisma2.user.findUnique({ where: { id: userId } });
        targetInstitutionId = authUser?.institutionId;
      }
      if (!targetInstitutionId) {
        return res.json({ studentCount: 0, activeGrants: 0, totalInteractions: 0, avgLearningTime: "0h 0m", recentActivity: [] });
      }
      const studentCount = await prisma2.user.count({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const recentActivity = await prisma2.studentActivity.findMany({
        where: { user: { institutionId: targetInstitutionId } },
        include: { user: true, content: true },
        take: 5,
        orderBy: { accessedAt: "desc" }
      });
      const interactions = await prisma2.studentActivity.count({ where: { user: { institutionId: targetInstitutionId } } });
      const totalTimeObj = await prisma2.studentActivity.aggregate({
        _sum: { timeSpent: true },
        where: { user: { institutionId: targetInstitutionId } }
      });
      const totalMins = totalTimeObj._sum.timeSpent || 0;
      let avgLearningTimeStr = "0h 0m";
      if (studentCount > 0 && totalMins > 0) {
        const avg = Math.floor(totalMins / studentCount);
        avgLearningTimeStr = `${Math.floor(avg / 60)}h ${avg % 60}m`;
      }
      res.json({ studentCount, activeGrants: studentCount, totalInteractions: interactions, avgLearningTime: avgLearningTimeStr, recentActivity });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });
  app.get("/api/institution/analytics", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === "Institution") {
        const userId = req.user.uid || req.user.id || req.user.userId;
        const authUser = await prisma2.user.findUnique({ where: { id: userId } });
        targetInstitutionId = authUser?.institutionId;
      }
      if (!targetInstitutionId) {
        return res.json({ totalStudents: 0, starReader: null, readingTimeline: [], topContent: [], totalInteractions: 0 });
      }
      const students = await prisma2.user.findMany({ where: { institutionId: targetInstitutionId, role: "Student" } });
      const activities = await prisma2.studentActivity.findMany({
        where: { user: { institutionId: targetInstitutionId } },
        include: { user: true, content: true }
      });
      const userActivityMap = /* @__PURE__ */ new Map();
      activities.forEach((a) => {
        if (!a.user) return;
        const current = userActivityMap.get(a.userId) || { count: 0, timeSpent: 0, user: a.user };
        current.count += 1;
        current.timeSpent += a.timeSpent || 0;
        userActivityMap.set(a.userId, current);
      });
      let starReader = null;
      let maxInteractions = 0;
      userActivityMap.forEach((val) => {
        if (val.count > maxInteractions) {
          maxInteractions = val.count;
          starReader = {
            name: val.user?.displayName || val.user?.email || "Unknown",
            interactions: val.count,
            timeSpent: val.timeSpent
          };
        }
      });
      const today = /* @__PURE__ */ new Date();
      const readingTimeline = Array.from({ length: 7 }).map((_, i2) => {
        const d = new Date(today);
        d.setDate(d.getDate() - (6 - i2));
        return {
          date: d.toLocaleDateString("en-US", { weekday: "short" }),
          students: Math.floor(Math.random() * (students.length > 0 ? students.length : 10)) + 1,
          interactions: Math.floor(Math.random() * 50) + 5
        };
      });
      const contentMap = /* @__PURE__ */ new Map();
      activities.forEach((a) => {
        if (!a.contentId) return;
        const current = contentMap.get(a.contentId) || { count: 0, content: a.content };
        current.count += 1;
        contentMap.set(a.contentId, current);
      });
      const topContent = Array.from(contentMap.values()).sort((a, b) => b.count - a.count).slice(0, 5).map((c) => ({
        title: c.content?.title || "Unknown",
        type: c.content?.contentType || "Book",
        reads: c.count
      }));
      res.json({
        totalStudents: students.length,
        starReader,
        readingTimeline,
        topContent,
        totalInteractions: activities.length
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });
  app.get("/api/institution/subscriptions", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const userId = req.user.uid || req.user.id || req.user.userId;
      const OR_clauses = [{ userId }];
      let instId = req.user.institutionId;
      if (!instId) {
        const u = await prisma2.user.findUnique({ where: { id: userId }, select: { institutionId: true } });
        instId = u?.institutionId;
      }
      if (instId) {
        OR_clauses.push({ institutionId: instId });
      }
      const subscriptions = await prisma2.subscription.findMany({
        where: { OR: OR_clauses },
        orderBy: { startDate: "desc" }
      });
      res.json(subscriptions);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch subscriptions" });
    }
  });
  app.get("/api/institution/profile", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const userId = req.user.uid || req.user.id || req.user.userId;
      const user = await prisma2.user.findUnique({ where: { id: userId } });
      if (!user) return res.status(404).json({ error: "User not found" });
      const prof = user.institutionProfile || {};
      res.json({
        institutionName: user.organization,
        // read-only
        contactName: user.displayName,
        state: user.state,
        // repurposed as city for now
        // Extended fields live in user metadata
        contactPhone: prof.contactPhone || "",
        address: prof.address || "",
        city: user.state || prof.city || "",
        website: prof.website || "",
        logoUrl: prof.logoUrl || "",
        coursesOffered: prof.coursesOffered || "",
        totalCourses: prof.totalCourses || "",
        studentBodySize: prof.studentBodySize || ""
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to load profile" });
    }
  });
  app.put("/api/institution/profile", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { contactName, city, contactPhone, address, website, logoUrl, coursesOffered, totalCourses, studentBodySize } = req.body;
      const userId = req.user.uid || req.user.id || req.user.userId;
      await prisma2.user.update({
        where: { id: userId },
        data: {
          ...contactName ? { displayName: contactName } : {},
          ...city ? { state: city } : {},
          institutionProfile: {
            contactPhone,
            address,
            city,
            website,
            logoUrl,
            coursesOffered,
            totalCourses,
            studentBodySize
          }
        }
      });
      res.json({ message: "Profile updated successfully" });
    } catch (err) {
      res.status(500).json({ error: "Failed to update profile" });
    }
  });
  app.get("/api/institution/students", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      let targetInstitutionId = req.query.institutionId;
      if (req.user.role === "Institution") {
        const userId = req.user.uid || req.user.id || req.user.userId;
        const authUser = await prisma2.user.findUnique({ where: { id: userId } });
        targetInstitutionId = authUser?.institutionId;
      }
      if (!targetInstitutionId) {
        return res.json([]);
      }
      const students = await prisma2.user.findMany({
        where: { institutionId: targetInstitutionId, role: "Student" },
        include: { subscriptions: true, activities: { include: { content: true } } },
        orderBy: { createdAt: "desc" }
      });
      res.json(students);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch students" });
    }
  });
  app.post("/api/institution/students", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { name, email, password, mobile, designation, branch, department } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email and password are required" });
      }
      const existing = await prisma2.user.findUnique({ where: { email } });
      if (existing) return res.status(409).json({ error: "A user with this email already exists" });
      const hashed = await import_bcryptjs.default.hash(password, 10);
      let institutionName = "";
      let targetInstitutionId = void 0;
      if (req.user.role === "Institution") {
        const institutionUser = await prisma2.user.findUnique({ where: { id: req.user.uid }, select: { organization: true, institutionId: true } });
        institutionName = institutionUser?.organization || "";
        targetInstitutionId = institutionUser?.institutionId;
      }
      const student = await prisma2.user.create({
        data: {
          email,
          password: hashed,
          displayName: name,
          role: "Student",
          // Preserve existing logic
          contact: mobile || null,
          designation: designation || "Student",
          organization: institutionName,
          institutionId: targetInstitutionId,
          institutionProfile: {
            branch: branch || "",
            department: department || ""
          }
        }
      });
      const { password: _, ...safe } = student;
      res.json(safe);
    } catch (err) {
      console.error("POST /api/institution/students error:", err?.message);
      res.status(500).json({ error: "Failed to create student", detail: err?.message });
    }
  });
  app.post("/api/institution/students/bulk", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { users } = req.body;
      if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({ error: "A valid array of users is required" });
      }
      let institutionName = "";
      let targetInstitutionId = void 0;
      if (req.user.role === "Institution") {
        const institutionUser = await prisma2.user.findUnique({ where: { id: req.user.uid }, select: { organization: true, institutionId: true } });
        institutionName = institutionUser?.organization || "";
        targetInstitutionId = institutionUser?.institutionId;
      }
      let successCount = 0;
      let errorCount = 0;
      const errors = [];
      for (const u of users) {
        try {
          if (!u.email || !u.name || !u.password) {
            errorCount++;
            errors.push({ email: u.email || "Unknown", error: "Missing required fields" });
            continue;
          }
          const existing = await prisma2.user.findUnique({ where: { email: u.email } });
          if (existing) {
            errorCount++;
            errors.push({ email: u.email, error: "Email already exists" });
            continue;
          }
          const hashed = await import_bcryptjs.default.hash(u.password, 10);
          await prisma2.user.create({
            data: {
              email: u.email,
              password: hashed,
              displayName: u.name,
              role: "Student",
              // Preserve existing logic
              contact: u.mobile || null,
              designation: u.designation || "Student",
              organization: institutionName,
              institutionId: targetInstitutionId,
              institutionProfile: {
                branch: u.branch || "",
                department: u.department || ""
              }
            }
          });
          successCount++;
        } catch (err) {
          errorCount++;
          errors.push({ email: u.email, error: err.message });
        }
      }
      res.json({ successCount, errorCount, errors });
    } catch (err) {
      console.error("POST /api/institution/students/bulk error:", err?.message);
      res.status(500).json({ error: "Failed to process bulk import", detail: err?.message });
    }
  });
  app.post("/api/institution/students/:id/block", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") return res.status(403).json({ error: "Unauthorized" });
      const { id } = req.params;
      const { isBlocked } = req.body;
      if (req.user.role === "Institution") {
        const callerId = req.user.uid || req.user.id || req.user.userId;
        const caller = await prisma2.user.findUnique({ where: { id: callerId } });
        const target = await prisma2.user.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ error: "Student not found" });
        if (!caller?.institutionId || target.institutionId !== caller.institutionId) {
          return res.status(403).json({ error: "Not your student" });
        }
      }
      const student = await prisma2.user.update({
        where: { id },
        data: { isBlocked }
      });
      res.json(student);
    } catch (err) {
      res.status(500).json({ error: "Failed to block student" });
    }
  });
  app.put("/api/institution/students/:id", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { id } = req.params;
      const { displayName, email, contact, designation, branch, department, password } = req.body;
      if (email) {
        const taken = await prisma2.user.findFirst({ where: { email, id: { not: id } } });
        if (taken) return res.status(409).json({ error: "Email already in use" });
      }
      const existing = await prisma2.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      if (req.user.role === "Institution") {
        const callerId = req.user.uid || req.user.id || req.user.userId;
        const caller = await prisma2.user.findUnique({ where: { id: callerId } });
        if (!caller?.institutionId || existing.institutionId !== caller.institutionId) {
          return res.status(403).json({ error: "Not your student" });
        }
      }
      let newInstitutionProfile = existing.institutionProfile || {};
      if (branch !== void 0) newInstitutionProfile.branch = branch;
      if (department !== void 0) newInstitutionProfile.department = department;
      let dataToUpdate = {
        ...displayName ? { displayName } : {},
        ...email ? { email } : {},
        ...contact !== void 0 ? { contact } : {},
        ...designation !== void 0 ? { designation } : {},
        institutionProfile: newInstitutionProfile
      };
      if (password && password.trim() !== "") {
        dataToUpdate.password = await import_bcryptjs.default.hash(password, 10);
      }
      const updated = await prisma2.user.update({
        where: { id },
        data: dataToUpdate
      });
      const { password: _, ...profile } = updated;
      res.json({ user: profile });
    } catch (err) {
      res.status(500).json({ error: "Failed to update student" });
    }
  });
  app.delete("/api/institution/students/:id", authenticateJWT, async (req, res) => {
    try {
      if (req.user.role !== "Institution" && req.user.role !== "SuperAdmin") {
        return res.status(403).json({ error: "Unauthorized" });
      }
      const { id } = req.params;
      if (req.user.role === "Institution") {
        const callerId = req.user.uid || req.user.id || req.user.userId;
        const caller = await prisma2.user.findUnique({ where: { id: callerId } });
        const target = await prisma2.user.findUnique({ where: { id } });
        if (!target) return res.status(404).json({ error: "Student not found" });
        if (!caller?.institutionId || target.institutionId !== caller.institutionId) {
          return res.status(403).json({ error: "Not your student" });
        }
      }
      await prisma2.user.delete({ where: { id } });
      res.json({ message: "Student removed" });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete student" });
    }
  });
  let currentValidationProgress = {
    isRunning: false,
    totalItems: 0,
    scannedItems: 0,
    issuesFound: 0,
    currentTask: "Idle"
  };
  const checkLink = async (url) => {
    if (!url || !url.startsWith("http")) return true;
    try {
      new URL(url);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4e3);
      const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
      const res = await fetch(url, { method: "HEAD", headers, signal: controller.signal }).catch(() => null);
      clearTimeout(timeoutId);
      if (res && res.status < 400) return true;
      const controller2 = new AbortController();
      const timeoutId2 = setTimeout(() => controller2.abort(), 6e3);
      const resGet = await fetch(url, { method: "GET", headers, signal: controller2.signal }).catch(() => null);
      clearTimeout(timeoutId2);
      return resGet ? resGet.status < 400 : false;
    } catch {
      return false;
    }
  };
  const LINK_BATCH_SIZE = 100;
  const checkLinksBatch = async (items) => {
    const results = [];
    for (let i2 = 0; i2 < items.length; i2 += LINK_BATCH_SIZE) {
      const batch = items.slice(i2, i2 + LINK_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          const isOk = await checkLink(item.url);
          if (!isOk) {
            return {
              contentId: item.id,
              title: item.title,
              contentType: item.contentType,
              issueType: "BrokenLink",
              description: `${item.urlLabel} is unreachable or forbidden: ${item.url}`
            };
          }
          return null;
        })
      );
      results.push(...batchResults.filter(Boolean));
    }
    return results;
  };
  const FILE_REQUIRED_TYPES = /* @__PURE__ */ new Set(["Book", "Journal", "Conference Paper", "Video", "Periodical", "Report"]);
  const runValidationEngine = async (type) => {
    if (currentValidationProgress.isRunning) return;
    try {
      const contents = await prisma2.content.findMany({
        where: { status: { not: "Draft" } },
        // Skip already-drafted content — no point re-flagging it
        select: { id: true, title: true, description: true, authors: true, fileUrl: true, thumbnailUrl: true, domain: true, contentType: true }
      });
      currentValidationProgress = {
        isRunning: true,
        totalItems: contents.length,
        scannedItems: 0,
        issuesFound: 0,
        currentTask: "Initializing Engine...",
        startedAt: Date.now()
      };
      const report = await prisma2.validationReport.create({
        data: { type, status: "Reviewing", issues: [] }
      });
      const issues = [];
      const titleDomainMap = /* @__PURE__ */ new Map();
      const urlMap = /* @__PURE__ */ new Map();
      const urlsToCheck = [];
      currentValidationProgress.currentTask = "Pass 1/2: Checking metadata & duplicates...";
      const dummyRegex = /^(test|test title)$|\b(dummy|lorem ipsum|placeholder)\b/i;
      for (const c of contents) {
        currentValidationProgress.scannedItems++;
        await new Promise((resolve) => setImmediate(resolve));
        if (dummyRegex.test(c.title) || c.description && dummyRegex.test(c.description)) {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "DummyData", description: "Contains suspicious dummy/placeholder text in title or description." });
        }
        const needsFile = FILE_REQUIRED_TYPES.has(c.contentType);
        if (needsFile && (!c.fileUrl || c.fileUrl.trim().length === 0)) {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "MissingMetadata", description: `A "${c.contentType}" is expected to have a file URL but none is set.` });
        }
        if (!c.authors || c.authors.trim().length === 0 || c.authors.toLowerCase() === "unknown") {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "MissingMetadata", description: "Author field is empty or set to 'Unknown'." });
        }
        const compositeKey = `${c.title.toLowerCase().trim()}-${(c.domain || "").toLowerCase()}`;
        if (titleDomainMap.has(compositeKey)) {
          issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "DuplicateTitle", description: "Title matches another entry within the same domain." });
        } else {
          titleDomainMap.set(compositeKey, c.id);
        }
        if (c.fileUrl && c.fileUrl.trim().length > 0) {
          if (urlMap.has(c.fileUrl)) {
            issues.push({ contentId: c.id, title: c.title, contentType: c.contentType, issueType: "DuplicateFile", description: "File URL matches another active entry \u2014 possible duplicate upload." });
          } else {
            urlMap.set(c.fileUrl, c.id);
          }
        }
        if (c.fileUrl && c.fileUrl.startsWith("http")) {
          urlsToCheck.push({ id: c.id, title: c.title, contentType: c.contentType, url: c.fileUrl, urlLabel: "File URL" });
        }
        if (c.thumbnailUrl && c.thumbnailUrl.startsWith("http")) {
          urlsToCheck.push({ id: c.id, title: c.title, contentType: c.contentType, url: c.thumbnailUrl, urlLabel: "Thumbnail URL" });
        }
        currentValidationProgress.issuesFound = issues.length;
      }
      if (urlsToCheck.length > 0) {
        currentValidationProgress.currentTask = `Pass 2/2: Checking ${urlsToCheck.length} URLs (${LINK_BATCH_SIZE} at a time)...`;
        const linkIssues = await checkLinksBatch(urlsToCheck);
        issues.push(...linkIssues);
        currentValidationProgress.issuesFound = issues.length;
      }
      currentValidationProgress.currentTask = "Saving report...";
      await prisma2.validationReport.update({
        where: { id: report.id },
        data: {
          status: "Draft",
          totalItemsScanned: contents.length,
          issuesFound: issues.length,
          issues,
          completedAt: /* @__PURE__ */ new Date()
        }
      });
    } catch (e2) {
      console.error("Validation engine crashed: ", e2);
    } finally {
      currentValidationProgress.isRunning = false;
      currentValidationProgress.currentTask = "Idle";
      currentValidationProgress.startedAt = void 0;
    }
  };
  import_node_cron.default.schedule("0 0 1 * *", () => {
    console.log("Running scheduled System Validation...");
    runValidationEngine("Automatic").catch((err) => console.error("Validation error:", err));
  });
  app.get("/api/admin/validator/progress", authenticateJWT, requireSuperAdmin, async (req, res) => {
    res.json(currentValidationProgress);
  });
  app.post("/api/admin/validator/draft-content", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { contentIds, reportId } = req.body;
      if (!contentIds || !Array.isArray(contentIds)) return res.status(400).json({ error: "Invalid contentIds array" });
      await prisma2.content.updateMany({
        where: { id: { in: contentIds } },
        data: { status: "Draft" }
      });
      if (reportId) {
        const report = await prisma2.validationReport.findUnique({ where: { id: reportId } });
        if (report) {
          const existingDrafted = Array.isArray(report.draftedContentIds) ? report.draftedContentIds : [];
          const merged = Array.from(/* @__PURE__ */ new Set([...existingDrafted, ...contentIds]));
          const tl = Array.isArray(report.timeline) ? report.timeline : [];
          const actor = req.user?.email || req.user?.name || "Admin";
          tl.push({
            action: "drafted",
            by: actor,
            at: (/* @__PURE__ */ new Date()).toISOString(),
            count: contentIds.length,
            note: `${contentIds.length} item(s) moved to Draft status.`
          });
          await prisma2.validationReport.update({
            where: { id: reportId },
            data: { draftedContentIds: merged, timeline: tl }
          });
        }
      }
      res.json({ message: "Content items successfully drafted.", draftedCount: contentIds.length });
    } catch (error) {
      console.error("Draft Error:", error);
      res.status(500).json({ error: "Failed to draft content" });
    }
  });
  app.get("/api/admin/validator/reports", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const reports = await prisma2.validationReport.findMany({ orderBy: { startedAt: "desc" } });
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch validation reports" });
    }
  });
  app.post("/api/admin/validator/run", authenticateJWT, requireSuperAdmin, async (req, res) => {
    if (currentValidationProgress.isRunning) return res.status(400).json({ error: "Validation is already running." });
    try {
      res.json({ message: "Validation triggered successfully. It will run in the background." });
      runValidationEngine("Manual").catch((err) => console.error("Manual validation error:", err));
    } catch (error) {
      res.status(500).json({ error: "Failed to run validator" });
    }
  });
  app.put("/api/admin/validator/reports/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const report = await prisma2.validationReport.findUnique({ where: { id } });
      if (!report) return res.status(404).json({ error: "Report not found" });
      const tl = Array.isArray(report.timeline) ? report.timeline : [];
      const actor = req.user?.email || req.user?.name || "Admin";
      tl.push({
        action: "status_changed",
        by: actor,
        at: (/* @__PURE__ */ new Date()).toISOString(),
        note: `Status changed to "${status}".`
      });
      const updated = await prisma2.validationReport.update({
        where: { id },
        data: { status, timeline: tl }
      });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Failed to update report status" });
    }
  });
  app.delete("/api/admin/validator/reports/:id", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await prisma2.validationReport.delete({ where: { id } });
      res.json({ message: "Report deleted successfully." });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete report" });
    }
  });
  let currentViewerValidationProgress = {
    isRunning: false,
    totalItems: 0,
    scannedItems: 0,
    validCount: 0,
    flaggedCount: 0,
    currentTask: "Idle"
  };
  const makeValidatorToken = () => import_jsonwebtoken.default.sign({ uid: "__validator__", role: "SuperAdmin" }, JWT_SECRET, { expiresIn: "10m" });
  const validateFileViewability = async (contentId, url, contentType) => {
    if (!url || url.trim().length === 0) {
      return { isViewable: false, viewerStatus: "No File", flaggedReason: "No file URL is set for this content item." };
    }
    const lowerUrl = url.split("?")[0].toLowerCase();
    const isVideo = /\.(mp4|webm|ogg|avi|mov)$/i.test(lowerUrl);
    const isPdf = lowerUrl.endsWith(".pdf") || lowerUrl.includes(".pdf") || contentType.toLowerCase().includes("pdf") || contentType.toLowerCase().includes("book") || contentType.toLowerCase().includes("journal") || contentType.toLowerCase().includes("report") || contentType.toLowerCase().includes("periodical");
    const knownPagePatterns = [
      /archive\.org\/details\//i,
      /jstor\.org\/stable\//i,
      /doi\.org\//i,
      /pubmed\.ncbi\.nlm\.nih\.gov\//i,
      /researchgate\.net\/publication\//i,
      /sciencedirect\.com\/science\/article\//i,
      /springer\.com\/article\//i,
      /wiley\.com\/doi\//i,
      /tandfonline\.com\/doi\//i,
      /ncbi\.nlm\.nih\.gov\/pmc\/articles\//i
    ];
    const hasFileExtension = /\.(pdf|mp4|webm|ogg|avi|mov|epub|djvu)(\?|$)/i.test(url);
    const isKnownPageUrl = knownPagePatterns.some((p) => p.test(url));
    if (isKnownPageUrl && !hasFileExtension) {
      return {
        isViewable: false,
        viewerStatus: "Load Failed",
        flaggedReason: `Webpage URL detected \u2014 "${url.slice(0, 120)}" is a webpage link, not a direct file download. Users cannot open this in the PDF viewer. Replace with a direct .pdf download URL.`
      };
    }
    try {
      const PORT_INTERNAL = process.env.PORT || 3e3;
      const proxyUrl = `http://127.0.0.1:${PORT_INTERNAL}/api/content/${contentId}/proxy-pdf`;
      const validatorToken = makeValidatorToken();
      const proxyCtrl = new AbortController();
      const proxyTid = setTimeout(() => proxyCtrl.abort(), 15e3);
      const proxyRes = await fetch(proxyUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${validatorToken}`,
          Range: "bytes=0-8192"
          // Only fetch the first 8KB for validation, drastically speeding up the engine!
        },
        signal: proxyCtrl.signal
      }).catch(() => null);
      clearTimeout(proxyTid);
      if (!proxyRes) {
        return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "Proxy endpoint did not respond within 15 seconds \u2014 file may be unreachable." };
      }
      if (proxyRes.status === 404) {
        return { isViewable: false, viewerStatus: "No File", flaggedReason: "Content not found or has no file URL." };
      }
      if (proxyRes.status >= 400) {
        return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `Proxy returned HTTP ${proxyRes.status} \u2014 file inaccessible to users.` };
      }
      if (isVideo) {
        return { isViewable: true, viewerStatus: "Rendered OK" };
      }
      let totalLength = 0;
      const chunks = [];
      if (proxyRes.body) {
        const reader = proxyRes.body.getReader();
        try {
          while (totalLength < 8192) {
            const { done, value } = await reader.read();
            if (done || !value) break;
            chunks.push(value);
            totalLength += value.length;
          }
        } finally {
          proxyCtrl.abort();
        }
      } else {
        const rawBuf = await proxyRes.arrayBuffer();
        chunks.push(new Uint8Array(rawBuf));
        totalLength = chunks[0].length;
      }
      const fullBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        fullBytes.set(chunk, offset);
        offset += chunk.length;
      }
      const rawBytes = fullBytes.slice(0, 16);
      const magic = new TextDecoder("latin1").decode(rawBytes).substring(0, 5);
      const first16Str = magic.toLowerCase();
      const isHtml = first16Str.startsWith("<!doc") || first16Str.startsWith("<html") || first16Str.startsWith("<!-") || first16Str.trimStart().startsWith("<");
      if (isHtml) {
        return {
          isViewable: false,
          viewerStatus: "Load Failed",
          flaggedReason: `The stored URL returns an HTML webpage, not a PDF file. URL: "${url.slice(0, 100)}". This cannot be opened in the PDF viewer. Replace it with a direct download link ending in .pdf`
        };
      }
      if (isPdf) {
        if (!magic.startsWith("%PDF")) {
          return {
            isViewable: false,
            viewerStatus: "Load Failed",
            flaggedReason: `File does not start with PDF magic bytes (found: "${magic.substring(0, 4)}"). The URL may point to a redirect page, login wall, or non-PDF file instead of a direct PDF download.`
          };
        }
        const pdfStr = new TextDecoder("latin1").decode(fullBytes.slice(0, Math.min(fullBytes.length, 8192)));
        const hasPages = pdfStr.includes("/Page") || pdfStr.includes("/Type") || pdfStr.includes("stream");
        if (!hasPages && fullBytes.length < 512) {
          return {
            isViewable: false,
            viewerStatus: "Load Failed",
            flaggedReason: "PDF file is too small or contains no readable page structure. The file is likely empty or corrupt."
          };
        }
        return { isViewable: true, viewerStatus: "Rendered OK" };
      }
      return { isViewable: true, viewerStatus: "Rendered OK" };
    } catch (err) {
      if (err?.name === "AbortError") {
        return { isViewable: false, viewerStatus: "Timeout", flaggedReason: "Proxy connection timed out." };
      }
      return { isViewable: false, viewerStatus: "Load Failed", flaggedReason: `Network error: ${err?.message || "Unknown"}` };
    }
  };
  const VIEWER_BATCH_SIZE = 50;
  const runViewerValidationEngine = async (type) => {
    if (currentViewerValidationProgress.isRunning) return;
    try {
      const contents = await prisma2.content.findMany({
        where: { fileUrl: { not: null } },
        // scan all content that has a file URL
        select: { id: true, title: true, contentType: true, fileUrl: true, status: true }
      });
      currentViewerValidationProgress = {
        isRunning: true,
        totalItems: contents.length,
        scannedItems: 0,
        validCount: 0,
        flaggedCount: 0,
        currentTask: "Initializing Viewer Engine...",
        startedAt: Date.now()
      };
      const report = await prisma2.validationReport.create({
        data: {
          type,
          validationType: "ViewerBased",
          status: "Reviewing",
          issues: []
        }
      });
      const issues = [];
      let validCount = 0;
      let flaggedCount = 0;
      for (let i2 = 0; i2 < contents.length; i2 += VIEWER_BATCH_SIZE) {
        if (!currentViewerValidationProgress.isRunning) {
          console.log("Viewer validation stopped by user.");
          break;
        }
        const batch = contents.slice(i2, i2 + VIEWER_BATCH_SIZE);
        currentViewerValidationProgress.currentTask = `Validating items ${i2 + 1}\u2013${Math.min(i2 + VIEWER_BATCH_SIZE, contents.length)} of ${contents.length}\u2026`;
        await Promise.all(
          batch.map(async (c) => {
            try {
              const result = await validateFileViewability(c.id, c.fileUrl || "", c.contentType);
              const updateData = {
                validationStatus: result.isViewable ? "VALID_VIEWABLE" : "FLAGGED_CONTENT",
                viewerStatus: result.viewerStatus,
                isViewable: result.isViewable,
                flaggedReason: result.flaggedReason ?? null,
                lastValidatedAt: /* @__PURE__ */ new Date()
              };
              await prisma2.content.update({ where: { id: c.id }, data: updateData });
              if (!result.isViewable) {
                issues.push({
                  contentId: c.id,
                  title: c.title,
                  contentType: c.contentType,
                  issueType: "ViewerValidationFailed",
                  description: result.flaggedReason || "File could not be verified by viewer.",
                  viewerStatus: result.viewerStatus
                });
                flaggedCount++;
              } else {
                validCount++;
              }
            } catch (itemErr) {
              console.error(`[viewer-validator] Item ${c.id} ("${c.title}") threw an error:`, itemErr?.message || itemErr);
              issues.push({
                contentId: c.id,
                title: c.title,
                contentType: c.contentType,
                issueType: "ViewerValidationFailed",
                description: `Validation threw an unexpected error: ${itemErr?.message || "Unknown error"}`,
                viewerStatus: "Load Failed"
              });
              flaggedCount++;
              try {
                await prisma2.content.update({
                  where: { id: c.id },
                  data: {
                    validationStatus: "FLAGGED_CONTENT",
                    viewerStatus: "Load Failed",
                    isViewable: false,
                    flaggedReason: `Validation error: ${itemErr?.message || "Unknown"}`,
                    lastValidatedAt: /* @__PURE__ */ new Date()
                  }
                });
              } catch {
              }
            } finally {
              currentViewerValidationProgress.scannedItems++;
              currentViewerValidationProgress.validCount = validCount;
              currentViewerValidationProgress.flaggedCount = flaggedCount;
            }
          })
        );
        await new Promise((r2) => setTimeout(r2, 50));
      }
      currentViewerValidationProgress.currentTask = "Saving report\u2026";
      await prisma2.validationReport.update({
        where: { id: report.id },
        data: {
          status: "Draft",
          totalItemsScanned: contents.length,
          issuesFound: issues.length,
          validCount,
          flaggedCount,
          issues,
          completedAt: /* @__PURE__ */ new Date()
        }
      });
    } catch (e2) {
      console.error("Viewer validation engine crashed:", e2);
    } finally {
      currentViewerValidationProgress.isRunning = false;
      currentViewerValidationProgress.currentTask = "Idle";
      currentViewerValidationProgress.startedAt = void 0;
    }
  };
  app.post("/api/admin/validator/run-viewer", authenticateJWT, requireSuperAdmin, async (req, res) => {
    if (currentViewerValidationProgress.isRunning) {
      return res.status(400).json({ error: "Viewer validation is already running." });
    }
    res.json({ message: "Viewer validation triggered. Running in background." });
    runViewerValidationEngine("Manual").catch((e2) => console.error("Viewer validation error:", e2));
  });
  app.post("/api/admin/validator/stop-viewer", authenticateJWT, requireSuperAdmin, async (req, res) => {
    if (currentViewerValidationProgress.isRunning) {
      currentViewerValidationProgress.isRunning = false;
      return res.json({ message: "Validation process stopped successfully." });
    }
    res.json({ message: "Validation is not running." });
  });
  app.get("/api/admin/validator/viewer-progress", authenticateJWT, requireSuperAdmin, async (_req, res) => {
    res.json(currentViewerValidationProgress);
  });
  app.get("/api/admin/validator/content-status", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { status, page = "1", limit = "50", search } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const where = {};
      if (status && status !== "All") where.validationStatus = status;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { contentType: { contains: search, mode: "insensitive" } }
        ];
      }
      const [items, total] = await Promise.all([
        prisma2.content.findMany({
          where,
          select: {
            id: true,
            title: true,
            contentType: true,
            domain: true,
            fileUrl: true,
            validationStatus: true,
            viewerStatus: true,
            isViewable: true,
            flaggedReason: true,
            lastValidatedAt: true,
            status: true
          },
          orderBy: { lastValidatedAt: "desc" },
          skip,
          take: parseInt(limit)
        }),
        prisma2.content.count({ where })
      ]);
      const [notValidated, validViewable, flaggedContent] = await Promise.all([
        prisma2.content.count({ where: { validationStatus: "Not Validated", status: { not: "Draft" } } }),
        prisma2.content.count({ where: { validationStatus: "VALID_VIEWABLE" } }),
        prisma2.content.count({ where: { validationStatus: "FLAGGED_CONTENT" } })
      ]);
      res.json({ items, total, page: parseInt(page), limit: parseInt(limit), summary: { notValidated, validViewable, flaggedContent } });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch content validation status" });
    }
  });
  app.patch("/api/admin/validator/content/:id/mark-valid", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await prisma2.content.update({
        where: { id },
        data: {
          validationStatus: "VALID_VIEWABLE",
          viewerStatus: "Manually Verified",
          isViewable: true,
          flaggedReason: null,
          lastValidatedAt: /* @__PURE__ */ new Date()
        }
      });
      res.json({ message: "Content marked as VALID_VIEWABLE by admin." });
    } catch (error) {
      res.status(500).json({ error: "Failed to mark content as valid" });
    }
  });
  app.patch("/api/admin/validator/content/:id/move-draft", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await prisma2.content.update({
        where: { id },
        data: { status: "Draft" }
      });
      res.json({ message: "Content moved to Draft." });
    } catch (error) {
      res.status(500).json({ error: "Failed to move content to draft" });
    }
  });
  app.post("/api/admin/validator/auto-cleanup", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const result = await prisma2.content.updateMany({
        where: { validationStatus: "FLAGGED_CONTENT", status: { not: "Draft" } },
        data: { status: "Draft" }
      });
      const latestReport = await prisma2.validationReport.findFirst({
        where: { validationType: "ViewerBased" },
        orderBy: { startedAt: "desc" }
      });
      if (latestReport) {
        const tl = Array.isArray(latestReport.timeline) ? latestReport.timeline : [];
        const actor = req.user?.email || "Admin";
        tl.push({
          action: "auto_cleanup",
          by: actor,
          at: (/* @__PURE__ */ new Date()).toISOString(),
          count: result.count,
          note: `Auto-cleanup: ${result.count} flagged item(s) moved to Draft.`
        });
        await prisma2.validationReport.update({ where: { id: latestReport.id }, data: { timeline: tl } });
      }
      res.json({ message: `Auto-cleanup complete. ${result.count} item(s) moved to Draft.`, count: result.count });
    } catch (error) {
      res.status(500).json({ error: "Auto-cleanup failed" });
    }
  });
  app.post("/api/admin/validator/re-validate", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { contentIds, status, search } = req.body;
      let contents;
      if (Array.isArray(contentIds) && contentIds.length > 0) {
        contents = await prisma2.content.findMany({
          where: { id: { in: contentIds } },
          select: { id: true, title: true, contentType: true, fileUrl: true }
        });
      } else if (status) {
        const where = {};
        if (status !== "All") where.validationStatus = status;
        if (search) {
          where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { contentType: { contains: search, mode: "insensitive" } }
          ];
        }
        contents = await prisma2.content.findMany({
          where,
          select: { id: true, title: true, contentType: true, fileUrl: true }
        });
      } else {
        return res.status(400).json({ error: "contentIds array or status filter is required." });
      }
      if (contents.length > 50) {
        if (currentViewerValidationProgress.isRunning) {
          return res.status(400).json({ error: "A viewer validation scan is already running." });
        }
        res.json({ message: `Bulk re-validation of ${contents.length} items started.`, background: true });
        (async () => {
          currentViewerValidationProgress = {
            isRunning: true,
            totalItems: contents.length,
            scannedItems: 0,
            validCount: 0,
            flaggedCount: 0,
            currentTask: "Initializing Bulk Engine...",
            startedAt: Date.now()
          };
          try {
            const VIEWER_BATCH_SIZE2 = 10;
            for (let i2 = 0; i2 < contents.length; i2 += VIEWER_BATCH_SIZE2) {
              if (!currentViewerValidationProgress.isRunning) {
                console.log("Bulk re-validation stopped by user.");
                break;
              }
              const batch = contents.slice(i2, i2 + VIEWER_BATCH_SIZE2);
              currentViewerValidationProgress.currentTask = `Re-validating ${i2 + 1}\u2013${Math.min(i2 + VIEWER_BATCH_SIZE2, contents.length)} of ${contents.length}\u2026`;
              await Promise.all(
                batch.map(async (c) => {
                  try {
                    const result = await validateFileViewability(c.id, c.fileUrl || "", c.contentType);
                    await prisma2.content.update({
                      where: { id: c.id },
                      data: {
                        validationStatus: result.isViewable ? "VALID_VIEWABLE" : "FLAGGED_CONTENT",
                        viewerStatus: result.viewerStatus,
                        isViewable: result.isViewable,
                        flaggedReason: result.flaggedReason ?? null,
                        lastValidatedAt: /* @__PURE__ */ new Date()
                      }
                    });
                    if (result.isViewable) {
                      currentViewerValidationProgress.validCount++;
                    } else {
                      currentViewerValidationProgress.flaggedCount++;
                    }
                  } catch (err) {
                    console.error("Item re-validation error:", err);
                  }
                })
              );
              currentViewerValidationProgress.scannedItems += batch.length;
            }
          } catch (e2) {
            console.error("Bulk re-validation crashed:", e2);
          } finally {
            currentViewerValidationProgress.isRunning = false;
            currentViewerValidationProgress.currentTask = "Idle";
            currentViewerValidationProgress.startedAt = void 0;
          }
        })();
        return;
      }
      const results = [];
      for (const c of contents) {
        const result = await validateFileViewability(c.id, c.fileUrl || "", c.contentType);
        await prisma2.content.update({
          where: { id: c.id },
          data: {
            validationStatus: result.isViewable ? "VALID_VIEWABLE" : "FLAGGED_CONTENT",
            viewerStatus: result.viewerStatus,
            isViewable: result.isViewable,
            flaggedReason: result.flaggedReason ?? null,
            lastValidatedAt: /* @__PURE__ */ new Date()
          }
        });
        results.push({ id: c.id, title: c.title, ...result });
      }
      res.json({ message: `Re-validated ${results.length} item(s).`, results });
    } catch (error) {
      console.error("Re-validation error:", error);
      res.status(500).json({ error: "Re-validation failed" });
    }
  });
  app.post("/api/agency-inquiry", async (req, res) => {
    try {
      const { agencyName, contactPerson, email, phone, region, experience, message } = req.body;
      const inquiry = await prisma2.agencyInquiry.create({
        data: { agencyName, contactPerson, email, phone, region, experience, message }
      });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const adminMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: process.env.ADMIN_EMAIL || "info@celnet.in",
        subject: `\u{1F91D} New Agency Partner Application: ${agencyName}`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F91D} New Agency Partnership Application</p><p style="margin:0 0 20px;font-size:13px;color:#475569;">A new reseller agency has applied to partner with STM Digital Library.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">\u{1F3E2} Agency Profile</p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Agency:</span> <strong style="color:#fff;">${agencyName}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Contact:</span> <strong style="color:#e2e8f0;">${contactPerson}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Region:</span> <strong style="color:#86efac;">${region || "Not specified"}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Experience:</span> <strong style="color:#fde68a;">${experience || "Not specified"}</strong></p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:16px;"><tr style="background:#f8fafc;"><td style="padding:10px 16px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e2e8f0;" colspan="2">Contact Details</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;width:35%;border-bottom:1px solid #f1f5f9;">Email</td><td style="padding:9px 16px;font-size:13px;font-weight:700;color:#1e3a6e;border-bottom:1px solid #f1f5f9;">${email}</td></tr><tr style="background:#fafbfc;"><td style="padding:9px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;">Phone</td><td style="padding:9px 16px;font-size:13px;color:#1e293b;border-bottom:1px solid #f1f5f9;">${phone || "Not provided"}</td></tr><tr><td style="padding:9px 16px;font-size:12px;color:#94a3b8;">Message</td><td style="padding:9px 16px;font-size:13px;color:#475569;">${message || "None"}</td></tr></table><div style="background:#eff6ff;border-left:4px solid #1e3a6e;border-radius:0 8px 8px 0;padding:12px 16px;"><p style="margin:0;font-size:13px;color:#1e3a6e;">\u2139\uFE0F Use <strong>Accept / Reject</strong> in the admin panel to respond.</p></div></td></tr>`
        )
      };
      const userMailOptions = {
        from: `"STM Digital Library" <${emailFrom}>`,
        to: email,
        subject: `\u{1F31F} Your Partnership Application \u2014 STM Digital Library`,
        html: buildEmail(
          `<tr><td style="padding:28px 40px 24px;"><p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#1e3a6e;">\u{1F31F} Application Received!</p><p style="margin:0 0 20px;font-size:13px;color:#475569;line-height:1.7;">Dear <strong>${contactPerson}</strong>, thank you for applying to become a certified partner of <strong>STM Digital Library</strong>. Your application for <strong>${agencyName}</strong> is under review.</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#1e3a6e;border-radius:10px;margin-bottom:20px;"><tr><td style="padding:18px 20px;"><p style="color:#bfdbfe;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">\u{1F4BC} Application Summary</p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Agency:</span> <strong style="color:#fff;">${agencyName}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Region:</span> <strong style="color:#86efac;">${region || "Not specified"}</strong></p><p style="margin:3px 0;font-size:13px;color:#e2e8f0;"><span style="color:#93c5fd;">Status:</span> <strong style="color:#fde68a;">\u23F3 Under Review</strong></p></td></tr></table><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ff;border-radius:10px;border:1px solid #ddd6fe;margin-bottom:18px;"><tr><td style="padding:18px 20px;"><p style="color:#7e22ce;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin:0 0 10px;">\u{1F3C6} What Partners Get</p><p style="margin:4px 0;font-size:13px;color:#1e293b;">\u2726 Exclusive reseller pricing &amp; margins</p><p style="margin:4px 0;font-size:13px;color:#1e293b;">\u2726 Dedicated partner support &amp; training</p><p style="margin:4px 0;font-size:13px;color:#1e293b;">\u2726 Co-branded marketing materials</p><p style="margin:4px 0;font-size:13px;color:#1e293b;">\u2726 Access to 50,000+ academic journals &amp; content</p></td></tr></table><p style="font-size:12px;color:#64748b;margin:0;">We'll respond within <strong>2\u20133 business days</strong> at <strong>${email}</strong>. For urgent queries: <a href="mailto:info@celnet.in" style="color:#1e3a6e;font-weight:600;">info@celnet.in</a></p></td></tr>`
        )
      };
      await sendMail(adminMailOptions);
      await sendMail(userMailOptions);
      res.json({ success: true, inquiry });
    } catch (error) {
      console.error("Failed to create agency inquiry:", error);
      res.status(500).json({ error: "Failed to submit inquiry" });
    }
  });
  app.get("/api/agency-inquiry", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const inquiries = await prisma2.agencyInquiry.findMany({
        orderBy: { createdAt: "desc" }
      });
      res.json(inquiries);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch inquiries" });
    }
  });
  app.post("/api/agency-inquiry/accept", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id, discount, emailContent, validUntil, subject, html, attachment } = req.body;
      const inquiry = await prisma2.agencyInquiry.findUnique({ where: { id } });
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      const mailOptions = {
        from: emailFrom,
        to: inquiry.email,
        subject: subject || "Welcome to the STM Digital Library Agency Partnership Program",
        html: html || `<div style="font-family: Arial, sans-serif; white-space: pre-wrap;">${emailContent}</div>`
      };
      if (attachment && attachment.content) {
        mailOptions.attachments = [
          {
            filename: attachment.filename || "Partnership_Agreement.pdf",
            content: Buffer.from(attachment.content, "base64"),
            contentType: "application/pdf"
          }
        ];
      }
      await sendMail(mailOptions);
      const updated = await prisma2.agencyInquiry.update({
        where: { id },
        data: {
          status: "Accepted",
          discount,
          validUntil: validUntil ? new Date(validUntil) : null
        }
      });
      res.json({ success: true, inquiry: updated });
    } catch (error) {
      console.error("Failed to accept agency inquiry:", error);
      res.status(500).json({ error: "Failed to process acceptance" });
    }
  });
  app.post("/api/agency-inquiry/reject", authenticateJWT, requireSuperAdmin, async (req, res) => {
    try {
      const { id, subject, html } = req.body;
      const inquiry = await prisma2.agencyInquiry.findUnique({ where: { id } });
      if (!inquiry) return res.status(404).json({ error: "Inquiry not found" });
      const emailFrom = (process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
      await sendMail({
        from: emailFrom,
        to: inquiry.email,
        subject: subject || "Update on Your STM Digital Library Partnership Application",
        html: html || "<p>Thank you for your interest, but we cannot proceed with your application at this time.</p>"
      });
      const updated = await prisma2.agencyInquiry.update({
        where: { id },
        data: { status: "Rejected" }
      });
      res.json({ success: true, inquiry: updated });
    } catch (error) {
      console.error("Failed to reject agency inquiry:", error);
      res.status(500).json({ error: "Failed to process rejection" });
    }
  });
  app.get("/api/coupons", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const coupons = await prisma2.coupon.findMany({ orderBy: { createdAt: "desc" } });
      res.json(coupons);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to fetch coupons" });
    }
  });
  app.post("/api/coupons", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { code, discountType, discountValue, maxUses, validFrom, validUntil, minimumOrderAmount } = req.body;
      const existing = await prisma2.coupon.findUnique({ where: { code } });
      if (existing) return res.status(400).json({ error: "Coupon code already exists" });
      const coupon = await prisma2.coupon.create({
        data: {
          code,
          discountType,
          discountValue: Number(discountValue),
          maxUses: maxUses ? Number(maxUses) : null,
          validFrom: validFrom ? new Date(validFrom) : null,
          validUntil: validUntil ? new Date(validUntil) : null,
          minimumOrderAmount: minimumOrderAmount ? Number(minimumOrderAmount) : null
        }
      });
      res.json(coupon);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to create coupon" });
    }
  });
  app.put("/api/coupons/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { isActive } = req.body;
      const coupon = await prisma2.coupon.update({
        where: { id: req.params.id },
        data: { isActive }
      });
      res.json(coupon);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to update coupon" });
    }
  });
  app.delete("/api/coupons/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      await prisma2.coupon.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to delete coupon" });
    }
  });
  app.post("/api/coupons/validate", async (req, res) => {
    try {
      const { code, orderAmount } = req.body;
      const coupon = await prisma2.coupon.findUnique({ where: { code } });
      if (!coupon) return res.status(404).json({ error: "Invalid coupon code" });
      if (!coupon.isActive) return res.status(400).json({ error: "Coupon is not active" });
      if (coupon.validFrom && new Date(coupon.validFrom) > /* @__PURE__ */ new Date()) return res.status(400).json({ error: "Coupon not yet valid" });
      if (coupon.validUntil && new Date(coupon.validUntil) < /* @__PURE__ */ new Date()) return res.status(400).json({ error: "Coupon has expired" });
      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) return res.status(400).json({ error: "Coupon usage limit reached" });
      if (coupon.minimumOrderAmount !== null && orderAmount < coupon.minimumOrderAmount) return res.status(400).json({ error: `Minimum order amount of \u20B9${coupon.minimumOrderAmount} required` });
      let discount = 0;
      if (coupon.discountType === "percentage") {
        discount = orderAmount * coupon.discountValue / 100;
      } else {
        discount = coupon.discountValue;
      }
      res.json({ valid: true, discount, couponId: coupon.id });
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to validate coupon" });
    }
  });
  app.get("/api/coupons/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const coupon = await prisma2.coupon.findUnique({
        where: { id: req.params.id },
        include: {
          usages: {
            include: { user: { select: { displayName: true, email: true } } },
            orderBy: { usedAt: "desc" }
          }
        }
      });
      if (!coupon) return res.status(404).json({ error: "Coupon not found" });
      res.json(coupon);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to fetch coupon details" });
    }
  });
  app.post("/api/analytics/track", async (req, res) => {
    try {
      const { path: path3, userRole, userId, sessionId } = req.body;
      const xForwardedFor = req.headers["x-forwarded-for"];
      const cfIp = req.headers["cf-connecting-ip"];
      let ipAddress = cfIp || (xForwardedFor ? xForwardedFor.split(",")[0].trim() : req.socket.remoteAddress);
      const cfCountry = req.headers["cf-ipcountry"];
      const cfCity = req.headers["cf-ipcity"];
      let locationStr = null;
      if (cfCountry) locationStr = cfCity ? `${cfCity}, ${cfCountry}` : cfCountry;
      const finalIpStr = locationStr ? `${ipAddress} (${locationStr})` : String(ipAddress);
      const userAgent = req.headers["user-agent"];
      await prisma2.pageVisit.create({
        data: {
          path: path3,
          userId,
          userRole,
          sessionId,
          ipAddress: finalIpStr,
          userAgent: userAgent ? String(userAgent) : null
        }
      });
      res.json({ success: true });
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to track visit" });
    }
  });
  app.get("/api/analytics/traffic", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { startDate, endDate } = req.query;
      let dateFilter = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            gte: new Date(startDate),
            lte: new Date(endDate)
          }
        };
      } else {
        const thirtyDaysAgo = /* @__PURE__ */ new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFilter = { createdAt: { gte: thirtyDaysAgo } };
      }
      const totalVisits = await prisma2.pageVisit.count({ where: dateFilter });
      const topPagesRaw = await prisma2.pageVisit.groupBy({
        by: ["path"],
        where: dateFilter,
        _count: { path: true },
        orderBy: { _count: { path: "desc" } },
        take: 10
      });
      const topPages = topPagesRaw.map((p) => ({
        path: p.path,
        count: p._count.path
      }));
      const allVisits = await prisma2.pageVisit.findMany({
        where: dateFilter,
        select: { createdAt: true, sessionId: true }
      });
      const dailyDataMap = /* @__PURE__ */ new Map();
      const dailySessionSets = /* @__PURE__ */ new Map();
      allVisits.forEach((v) => {
        const dateStr = v.createdAt.toISOString().split("T")[0];
        if (!dailySessionSets.has(dateStr)) dailySessionSets.set(dateStr, /* @__PURE__ */ new Set());
        if (v.sessionId) dailySessionSets.get(dateStr).add(v.sessionId);
        dailyDataMap.set(dateStr, (dailyDataMap.get(dateStr) || 0) + 1);
      });
      const dailyData = Array.from(dailyDataMap.entries()).map(([date, pageViews]) => ({
        date,
        pageViews,
        uniqueSessions: dailySessionSets.get(date)?.size || 0
      })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const totalUniqueSessions = new Set(allVisits.map((v) => v.sessionId).filter(Boolean)).size;
      res.json({ totalVisits, topPages, dailyData, totalUniqueSessions });
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });
  app.get("/api/analytics/detailed", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { date } = req.query;
      let dateFilter = { sessionId: { not: null } };
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        dateFilter.createdAt = {
          gte: startOfDay,
          lte: endOfDay
        };
      }
      const visits = await prisma2.pageVisit.findMany({
        orderBy: { createdAt: "asc" },
        where: dateFilter
      });
      const sessionsMap = /* @__PURE__ */ new Map();
      const userIds = /* @__PURE__ */ new Set();
      for (const visit of visits) {
        if (!visit.sessionId) continue;
        const sId = visit.sessionId;
        if (visit.userId) userIds.add(visit.userId);
        if (!sessionsMap.has(sId)) {
          sessionsMap.set(sId, {
            sessionId: sId,
            userId: visit.userId,
            userRole: visit.userRole || "Guest",
            ipAddress: visit.ipAddress,
            userAgent: visit.userAgent,
            startTime: visit.createdAt,
            endTime: visit.createdAt,
            paths: []
          });
        }
        const s2 = sessionsMap.get(sId);
        s2.endTime = visit.createdAt;
        s2.paths.push({ path: visit.path, time: visit.createdAt });
      }
      const users = await prisma2.user.findMany({
        where: { id: { in: Array.from(userIds) } },
        select: { id: true, displayName: true, email: true }
      });
      const userMap = new Map(users.map((u) => [u.id, u]));
      const sessions = Array.from(sessionsMap.values()).map((s2) => {
        const timeSpentSeconds = Math.max(0, Math.floor((new Date(s2.endTime).getTime() - new Date(s2.startTime).getTime()) / 1e3));
        let userName = s2.userRole;
        if (s2.userId && userMap.has(s2.userId)) {
          const u = userMap.get(s2.userId);
          userName = `${u.displayName || "User"} (${u.email})`;
        }
        return {
          ...s2,
          userName,
          timeSpentSeconds,
          timeSpentFormatted: timeSpentSeconds > 60 ? `${Math.floor(timeSpentSeconds / 60)}m ${timeSpentSeconds % 60}s` : `${timeSpentSeconds}s`
        };
      }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
      res.json(sessions);
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to fetch detailed analytics" });
    }
  });
  app.get("/api/admin/verifications", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const verifications = await prisma2.emailVerification.findMany({
        orderBy: { updatedAt: "desc" }
      });
      res.json(verifications);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch verifications" });
    }
  });
  app.post("/api/feedback", authenticateJWT, async (req, res) => {
    try {
      const { rating, comment, type } = req.body;
      const feedback = await prisma2.feedback.create({
        data: {
          rating: Number(rating) || 5,
          comment,
          type: type || "General",
          userId: req.user.uid
        }
      });
      res.json({ success: true, feedback });
    } catch (error) {
      console.error("Submit feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });
  app.get("/api/admin/feedbacks", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const feedbacks = await prisma2.feedback.findMany({
        include: {
          user: {
            select: {
              displayName: true,
              email: true,
              role: true,
              organization: true,
              isDemoAccount: true,
              subscriptions: {
                where: { status: "Active" },
                select: { planName: true, domains: true }
              }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      res.json(feedbacks);
    } catch (error) {
      console.error("Fetch feedbacks error:", error);
      res.status(500).json({ error: "Failed to fetch feedbacks" });
    }
  });
  app.get("/api/admin/feedbacks/:id", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const feedback = await prisma2.feedback.findUnique({
        where: { id: req.params.id },
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              email: true,
              role: true,
              organization: true,
              isDemoAccount: true,
              createdAt: true,
              updatedAt: true,
              subscriptions: {
                select: { id: true, planName: true, domains: true, status: true, startDate: true, endDate: true },
                orderBy: { startDate: "desc" }
              },
              institution: {
                select: {
                  subscriptions: {
                    select: { id: true, planName: true, domains: true, status: true, startDate: true, endDate: true },
                    orderBy: { startDate: "desc" }
                  }
                }
              }
            }
          }
        }
      });
      if (!feedback) return res.status(404).json({ error: "Feedback not found" });
      res.json(feedback);
    } catch (error) {
      console.error("Fetch feedback detail error:", error);
      res.status(500).json({ error: "Failed to fetch feedback details" });
    }
  });
  app.get("/api/user/feedbacks", authenticateJWT, async (req, res) => {
    try {
      const feedbacks = await prisma2.feedback.findMany({
        where: { userId: req.user.uid },
        orderBy: { createdAt: "desc" }
      });
      res.json(feedbacks);
    } catch (error) {
      console.error("Fetch user feedbacks error:", error);
      res.status(500).json({ error: "Failed to fetch user feedbacks" });
    }
  });
  app.get("/api/admin/leads", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const leads = await prisma2.lead.findMany({
        orderBy: { createdAt: "desc" },
        include: { assignedTo: { select: { id: true, displayName: true, email: true } } }
      });
      res.json(leads);
    } catch (error) {
      console.error("Fetch leads error:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });
  app.post("/api/admin/leads/assign", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const { leadIds, assignedToId } = req.body;
      if (!leadIds || !Array.isArray(leadIds) || !assignedToId) {
        return res.status(400).json({ error: "Invalid data provided" });
      }
      await prisma2.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { assignedToId, assignedAt: /* @__PURE__ */ new Date(), assignmentSeen: false }
      });
      await prisma2.leadInteraction.createMany({
        data: leadIds.map((leadId) => ({
          leadId,
          userId: req.user.uid,
          type: "System",
          notes: `Assigned to executive`
        }))
      });
      res.json({ message: "Leads assigned successfully" });
    } catch (error) {
      console.error("Assign leads error:", error);
      res.status(500).json({ error: "Failed to assign leads" });
    }
  });
  app.post("/api/admin/leads/migrate", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const demos = await prisma2.demoRequest.findMany();
      let demoCount = 0;
      for (const d of demos) {
        const exists = await prisma2.lead.findFirst({ where: { email: d.institutionalEmail, source: "Demo Request" } });
        if (!exists) {
          await prisma2.lead.create({
            data: {
              name: d.fullName,
              email: d.institutionalEmail,
              phone: d.whatsappNumber,
              organization: d.institutionName,
              state: d.state || null,
              source: "Demo Request",
              status: d.status === "Completed" ? "Subscriber" : "All",
              notes: d.adminNotes || "Requested Demo",
              createdAt: d.createdAt,
              updatedAt: d.updatedAt
            }
          });
          demoCount++;
        } else if (!exists.state && d.state) {
          await prisma2.lead.update({ where: { id: exists.id }, data: { state: d.state } });
        }
      }
      const contacts = await prisma2.contactInquiry.findMany();
      let contactCount = 0;
      for (const c of contacts) {
        const exists = await prisma2.lead.findFirst({ where: { email: c.email, source: "Contact Inquiry" } });
        if (!exists) {
          await prisma2.lead.create({
            data: {
              name: c.fullName,
              email: c.email,
              phone: c.mobile || c.whatsapp,
              organization: c.organization,
              state: c.state || null,
              source: "Contact Inquiry",
              status: c.status === "Resolved" ? "Subscriber" : "All",
              notes: c.message || "Contact Form Inquiry",
              createdAt: c.createdAt || /* @__PURE__ */ new Date(),
              updatedAt: c.updatedAt || /* @__PURE__ */ new Date()
            }
          });
          contactCount++;
        } else if (!exists.state && c.state) {
          await prisma2.lead.update({ where: { id: exists.id }, data: { state: c.state } });
        }
      }
      await prisma2.lead.updateMany({ where: { status: "New" }, data: { status: "All" } });
      await prisma2.lead.updateMany({ where: { status: "Contacted" }, data: { status: "Positive" } });
      await prisma2.lead.updateMany({ where: { status: "Converted" }, data: { status: "Subscriber" } });
      await prisma2.lead.updateMany({ where: { status: "Lost" }, data: { status: "Negative" } });
      res.json({ message: `Migration successful. Synced ${demoCount} Demos and ${contactCount} Contacts.` });
    } catch (error) {
      console.error("Migration error:", error);
      res.status(500).json({ error: "Failed to migrate leads" });
    }
  });
  app.get("/api/admin/sales-team", authenticateJWT, requireAdminOrManager, async (req, res) => {
    try {
      const team = await prisma2.user.findMany({
        where: { role: { in: ["SalesExecutive", "SalesManager"] } },
        select: {
          id: true,
          email: true,
          displayName: true,
          role: true,
          createdAt: true,
          _count: {
            select: { assignedLeads: true, leadInteractions: true }
          }
        }
      });
      const enhanced = await Promise.all(team.map(async (member) => {
        const subscriberCount = await prisma2.lead.count({
          where: { assignedToId: member.id, status: "Subscriber" }
        });
        const lastInteraction = await prisma2.leadInteraction.findFirst({
          where: { userId: member.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true }
        });
        return {
          ...member,
          subscriberCount,
          lastActiveAt: lastInteraction?.createdAt || null,
          conversionRate: member._count.assignedLeads > 0 ? parseFloat((subscriberCount / member._count.assignedLeads * 100).toFixed(1)) : 0
        };
      }));
      res.json(enhanced);
    } catch (error) {
      console.error("Fetch sales team error:", error);
      res.status(500).json({ error: "Failed to fetch sales team" });
    }
  });
  const requireSalesRole = (req, res, next) => {
    const r2 = req.user?.role;
    if (r2 === "SuperAdmin" || r2 === "SubscriptionManager" || r2 === "SalesExecutive" || r2 === "SalesManager") {
      next();
    } else {
      res.status(403).json({ error: "Access denied. Requires sales role." });
    }
  };
  app.get("/api/sales/my-leads", authenticateJWT, requireSalesRole, async (req, res) => {
    try {
      const leads = await prisma2.lead.findMany({
        where: { assignedToId: req.user.uid },
        orderBy: { updatedAt: "desc" }
      });
      prisma2.lead.updateMany({ where: { assignedToId: req.user.uid, assignmentSeen: false }, data: { assignmentSeen: true } }).catch(() => {
      });
      res.json(leads);
    } catch (error) {
      console.error("Fetch my leads error:", error);
      res.status(500).json({ error: "Failed to fetch leads" });
    }
  });
  app.get("/api/sales/notifications", authenticateJWT, requireSalesRole, async (req, res) => {
    try {
      const where = { assignedToId: req.user.uid, assignmentSeen: false };
      const [newLeads, list] = await Promise.all([
        prisma2.lead.count({ where }),
        prisma2.lead.findMany({ where, orderBy: { assignedAt: "desc" }, take: 10, select: { id: true, name: true, organization: true, source: true, assignedAt: true } })
      ]);
      res.json({ total: newLeads, newLeads, list });
    } catch (error) {
      res.status(500).json({ error: "Failed to load notifications" });
    }
  });
  app.get("/api/sales/my-activity", authenticateJWT, requireSalesRole, async (req, res) => {
    try {
      const myLeads = await prisma2.lead.findMany({
        where: { assignedToId: req.user.uid },
        select: { id: true }
      });
      const interactions = await prisma2.leadInteraction.findMany({
        where: { leadId: { in: myLeads.map((l) => l.id) } },
        orderBy: { createdAt: "desc" },
        include: {
          lead: { select: { name: true, organization: true, source: true } },
          user: { select: { displayName: true, email: true } }
        },
        take: 100
      });
      res.json(interactions);
    } catch (error) {
      console.error("Fetch my activity error:", error);
      res.status(500).json({ error: "Failed to fetch activity logs" });
    }
  });
  app.get("/api/sales/leads/:id", authenticateJWT, requireSalesRole, async (req, res) => {
    try {
      const lead = await prisma2.lead.findUnique({
        where: { id: req.params.id },
        include: {
          interactions: {
            orderBy: { createdAt: "desc" },
            include: { user: { select: { displayName: true, email: true, role: true } } }
          }
        }
      });
      if (!lead) return res.status(404).json({ error: "Lead not found" });
      res.json(lead);
    } catch (error) {
      console.error("Fetch lead detail error:", error);
      res.status(500).json({ error: "Failed to fetch lead details" });
    }
  });
  app.put("/api/sales/leads/:id/status", authenticateJWT, requireSalesRole, async (req, res) => {
    try {
      const { status } = req.body;
      const lead = await prisma2.lead.update({
        where: { id: req.params.id },
        data: { status }
      });
      res.json(lead);
    } catch (error) {
      console.error("Update lead status error:", error);
      res.status(500).json({ error: "Failed to update lead status" });
    }
  });
  app.post("/api/sales/leads/:id/interactions", authenticateJWT, requireSalesRole, async (req, res) => {
    try {
      const { type, notes } = req.body;
      const interaction = await prisma2.leadInteraction.create({
        data: {
          leadId: req.params.id,
          userId: req.user.uid,
          type: type || "Note",
          notes
        },
        include: {
          user: { select: { displayName: true, email: true, role: true } }
        }
      });
      await prisma2.lead.update({
        where: { id: req.params.id },
        data: { updatedAt: /* @__PURE__ */ new Date() }
      });
      res.json(interaction);
    } catch (error) {
      console.error("Create interaction error:", error);
      res.status(500).json({ error: "Failed to create interaction" });
    }
  });
  app.get("/api/public/content/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const content = await prisma2.content.findUnique({
        where: { id },
        select: {
          id: true,
          title: true,
          description: true,
          authors: true,
          domain: true,
          contentType: true,
          thumbnailUrl: true,
          publishedAt: true
        }
      });
      if (!content) return res.status(404).json({ error: "Content not found" });
      res.json({
        ...content,
        author: content.authors,
        coverImage: content.thumbnailUrl,
        publishedYear: new Date(content.publishedAt).getFullYear()
      });
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: "Failed to fetch content" });
    }
  });
  let cachedSitemapIndex = null;
  let cachedStaticSitemap = null;
  const cachedContentSitemaps = /* @__PURE__ */ new Map();
  let sitemapCacheTime = 0;
  app.get("/sitemap.xml", async (req, res) => {
    try {
      if (cachedSitemapIndex && Date.now() - sitemapCacheTime < 1e3 * 60 * 60 * 12) {
        res.type("application/xml");
        return res.send(cachedSitemapIndex);
      }
      const totalContent = await prisma2.content.count({ where: { status: "Published" } });
      const limitPerPage = 4e4;
      const totalPages = Math.ceil(totalContent / limitPerPage);
      const baseUrl = "https://journalslibrary.com";
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
      xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
      xml += `  <sitemap>
    <loc>${baseUrl}/sitemap-static.xml</loc>
    <lastmod>${(/* @__PURE__ */ new Date()).toISOString()}</lastmod>
  </sitemap>
`;
      for (let i2 = 1; i2 <= totalPages; i2++) {
        xml += `  <sitemap>
    <loc>${baseUrl}/sitemap-content-${i2}.xml</loc>
    <lastmod>${(/* @__PURE__ */ new Date()).toISOString()}</lastmod>
  </sitemap>
`;
      }
      xml += `</sitemapindex>`;
      cachedSitemapIndex = xml;
      sitemapCacheTime = Date.now();
      cachedContentSitemaps.clear();
      res.type("application/xml");
      res.send(xml);
    } catch (e2) {
      console.error("Sitemap index error:", e2);
      res.status(500).send("Error generating sitemap index");
    }
  });
  app.get("/sitemap-static.xml", (req, res) => {
    if (cachedStaticSitemap) {
      res.type("application/xml");
      return res.send(cachedStaticSitemap);
    }
    const baseUrl = "https://journalslibrary.com";
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
    const staticRoutes = ["/", "/journals", "/contact", "/subscriptions", "/about", "/signup"];
    for (const route of staticRoutes) {
      const loc = route === "/" ? baseUrl : `${baseUrl}${route}`;
      xml += `  <url>
    <loc>${loc}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
`;
    }
    xml += `</urlset>`;
    cachedStaticSitemap = xml;
    res.type("application/xml");
    res.send(xml);
  });
  app.get("/sitemap-content-:page.xml", async (req, res) => {
    try {
      const page = parseInt(req.params.page) || 1;
      const cacheKey = `page-${page}`;
      if (cachedContentSitemaps.has(cacheKey)) {
        res.type("application/xml");
        return res.send(cachedContentSitemaps.get(cacheKey));
      }
      const limitPerPage = 4e4;
      const skip = (page - 1) * limitPerPage;
      const allContent = await prisma2.content.findMany({
        where: { status: "Published" },
        select: { id: true, updatedAt: true },
        skip,
        take: limitPerPage
      });
      if (allContent.length === 0) {
        return res.status(404).send("Sitemap page not found");
      }
      const baseUrl = "https://journalslibrary.com";
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
`;
      xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;
      for (const content of allContent) {
        xml += `  <url>
    <loc>${baseUrl}/preview/${content.id}</loc>
    <lastmod>${new Date(content.updatedAt).toISOString()}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
`;
      }
      xml += `</urlset>`;
      cachedContentSitemaps.set(cacheKey, xml);
      res.type("application/xml");
      res.send(xml);
    } catch (e2) {
      console.error("Content sitemap error:", e2);
      res.status(500).send("Error generating content sitemap");
    }
  });
  setupExtractionRoutes(app, authenticateJWT, requireSuperAdmin);
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    app.use(import_express.default.static(import_path2.default.join(currentDir, "dist")));
    app.get("*", (req, res) => res.sendFile(import_path2.default.join(currentDir, "dist/index.html")));
  }
  app.use((err, req, res, next) => {
    console.error("Unhandled Error:", err);
    res.status(500).json({ error: "Internal server error" });
  });
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (Mode: ${process.env.NODE_ENV || "development"})`);
  });
}
startServer();
/*! Bundled license information:

web-streams-polyfill/dist/ponyfill.es2018.js:
  (**
   * @license
   * web-streams-polyfill v3.3.3
   * Copyright 2024 Mattias Buelens, Diwank Singh Tomer and other contributors.
   * This code is released under the MIT license.
   * SPDX-License-Identifier: MIT
   *)

fetch-blob/index.js:
  (*! fetch-blob. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> *)

formdata-polyfill/esm.min.js:
  (*! formdata-polyfill. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> *)

node-domexception/index.js:
  (*! node-domexception. MIT License. Jimmy Wärting <https://jimmy.warting.se/opensource> *)
*/
