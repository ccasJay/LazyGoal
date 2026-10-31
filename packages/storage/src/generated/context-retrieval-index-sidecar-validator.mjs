var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// ContextRetrievalIndexSidecarFile-validator.cjs
var require_ContextRetrievalIndexSidecarFile_validator = __commonJS({
  "ContextRetrievalIndexSidecarFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "schemaVersion": { "type": "number", "const": 1 }, "goalId": { "type": "string", "minLength": 1 }, "runId": { "type": "string", "minLength": 1 }, "derivedThroughSequence": { "type": "integer", "minimum": 0 }, "sourceDigest": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" }, "tokenizerVersion": { "type": "string", "const": "field-tokenizer-v1" }, "rankingVersion": { "type": "string", "minLength": 1 }, "indexVersion": { "type": "string", "minLength": 1 }, "documents": { "type": "array", "items": {}, "description": "Context Documents\uFF1B\u5143\u7D20\u7ED3\u6784\u4E0E\u6765\u6E90\u7531 `context-retrieval` \u7684\u7D22\u5F15\u91CD\u5EFA\u6821\u9A8C\u3002" }, "index": { "description": "\u5012\u6392\u7D22\u5F15\u5FEB\u7167\uFF1B\u4E0E `documents` \u7684\u7B49\u4EF7\u6027\u7531 `restoreContextInvertedIndex` \u6821\u9A8C\u3002" }, "queryCache": { "type": "array", "items": {}, "description": "\u67E5\u8BE2\u7F13\u5B58\uFF1B\u5BB9\u91CF\u548C\u7ED3\u679C\u7531 `ContextRetrievalQueryCache` \u6821\u9A8C\u3002" }, "conversationEndIndexExclusive": { "type": "integer", "minimum": 0 }, "conversationPrefixDigest": { "type": "string", "pattern": "^sha256:[0-9a-f]{64}$" } }, "required": ["schemaVersion", "goalId", "runId", "derivedThroughSequence", "sourceDigest", "tokenizerVersion", "rankingVersion", "indexVersion", "documents", "index", "queryCache", "conversationEndIndexExclusive", "conversationPrefixDigest"], "additionalProperties": false, "description": "Retrieval Index Sidecar \u9876\u5C42\u6587\u4EF6\u7684\u6301\u4E45\u5316 DTO\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var func3 = require_ucs2length().default;
    var pattern0 = new RegExp("^sha256:[0-9a-f]{64}$", "u");
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.schemaVersion === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "schemaVersion" }, message: "must have required property 'schemaVersion'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.goalId === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "goalId" }, message: "must have required property 'goalId'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.derivedThroughSequence === void 0) {
          const err3 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "derivedThroughSequence" }, message: "must have required property 'derivedThroughSequence'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.sourceDigest === void 0) {
          const err4 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "sourceDigest" }, message: "must have required property 'sourceDigest'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.tokenizerVersion === void 0) {
          const err5 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "tokenizerVersion" }, message: "must have required property 'tokenizerVersion'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.rankingVersion === void 0) {
          const err6 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "rankingVersion" }, message: "must have required property 'rankingVersion'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.indexVersion === void 0) {
          const err7 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "indexVersion" }, message: "must have required property 'indexVersion'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.documents === void 0) {
          const err8 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "documents" }, message: "must have required property 'documents'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        if (data.index === void 0) {
          const err9 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "index" }, message: "must have required property 'index'" };
          if (vErrors === null) {
            vErrors = [err9];
          } else {
            vErrors.push(err9);
          }
          errors++;
        }
        if (data.queryCache === void 0) {
          const err10 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "queryCache" }, message: "must have required property 'queryCache'" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (data.conversationEndIndexExclusive === void 0) {
          const err11 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "conversationEndIndexExclusive" }, message: "must have required property 'conversationEndIndexExclusive'" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (data.conversationPrefixDigest === void 0) {
          const err12 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/required", keyword: "required", params: { missingProperty: "conversationPrefixDigest" }, message: "must have required property 'conversationPrefixDigest'" };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema12.properties, key0)) {
            const err13 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.schemaVersion !== void 0) {
          let data0 = data.schemaVersion;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err14 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/schemaVersion/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
          if (1 !== data0) {
            const err15 = { instancePath: instancePath + "/schemaVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/schemaVersion/const", keyword: "const", params: { allowedValue: 1 }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.goalId !== void 0) {
          let data1 = data.goalId;
          if (typeof data1 === "string") {
            if (func3(data1) < 1) {
              const err16 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/goalId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
          } else {
            const err17 = { instancePath: instancePath + "/goalId", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/goalId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (func3(data2) < 1) {
              const err18 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/runId/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          } else {
            const err19 = { instancePath: instancePath + "/runId", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.derivedThroughSequence !== void 0) {
          let data3 = data.derivedThroughSequence;
          if (!(typeof data3 == "number" && (!(data3 % 1) && !isNaN(data3)) && isFinite(data3))) {
            const err20 = { instancePath: instancePath + "/derivedThroughSequence", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/derivedThroughSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (typeof data3 == "number" && isFinite(data3)) {
            if (data3 < 0 || isNaN(data3)) {
              const err21 = { instancePath: instancePath + "/derivedThroughSequence", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/derivedThroughSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
        if (data.sourceDigest !== void 0) {
          let data4 = data.sourceDigest;
          if (typeof data4 === "string") {
            if (!pattern0.test(data4)) {
              const err22 = { instancePath: instancePath + "/sourceDigest", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/sourceDigest/pattern", keyword: "pattern", params: { pattern: "^sha256:[0-9a-f]{64}$" }, message: 'must match pattern "^sha256:[0-9a-f]{64}$"' };
              if (vErrors === null) {
                vErrors = [err22];
              } else {
                vErrors.push(err22);
              }
              errors++;
            }
          } else {
            const err23 = { instancePath: instancePath + "/sourceDigest", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/sourceDigest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
        }
        if (data.tokenizerVersion !== void 0) {
          let data5 = data.tokenizerVersion;
          if (typeof data5 !== "string") {
            const err24 = { instancePath: instancePath + "/tokenizerVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/tokenizerVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          if ("field-tokenizer-v1" !== data5) {
            const err25 = { instancePath: instancePath + "/tokenizerVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/tokenizerVersion/const", keyword: "const", params: { allowedValue: "field-tokenizer-v1" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.rankingVersion !== void 0) {
          let data6 = data.rankingVersion;
          if (typeof data6 === "string") {
            if (func3(data6) < 1) {
              const err26 = { instancePath: instancePath + "/rankingVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/rankingVersion/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
          } else {
            const err27 = { instancePath: instancePath + "/rankingVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/rankingVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
        if (data.indexVersion !== void 0) {
          let data7 = data.indexVersion;
          if (typeof data7 === "string") {
            if (func3(data7) < 1) {
              const err28 = { instancePath: instancePath + "/indexVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/indexVersion/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
          } else {
            const err29 = { instancePath: instancePath + "/indexVersion", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/indexVersion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data.documents !== void 0) {
          if (!Array.isArray(data.documents)) {
            const err30 = { instancePath: instancePath + "/documents", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/documents/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
        if (data.queryCache !== void 0) {
          if (!Array.isArray(data.queryCache)) {
            const err31 = { instancePath: instancePath + "/queryCache", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/queryCache/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
        }
        if (data.conversationEndIndexExclusive !== void 0) {
          let data10 = data.conversationEndIndexExclusive;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err32 = { instancePath: instancePath + "/conversationEndIndexExclusive", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/conversationEndIndexExclusive/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err32];
            } else {
              vErrors.push(err32);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 < 0 || isNaN(data10)) {
              const err33 = { instancePath: instancePath + "/conversationEndIndexExclusive", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/conversationEndIndexExclusive/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
        }
        if (data.conversationPrefixDigest !== void 0) {
          let data11 = data.conversationPrefixDigest;
          if (typeof data11 === "string") {
            if (!pattern0.test(data11)) {
              const err34 = { instancePath: instancePath + "/conversationPrefixDigest", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/conversationPrefixDigest/pattern", keyword: "pattern", params: { pattern: "^sha256:[0-9a-f]{64}$" }, message: 'must match pattern "^sha256:[0-9a-f]{64}$"' };
              if (vErrors === null) {
                vErrors = [err34];
              } else {
                vErrors.push(err34);
              }
              errors++;
            }
          } else {
            const err35 = { instancePath: instancePath + "/conversationPrefixDigest", schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/properties/conversationPrefixDigest/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err35];
            } else {
              vErrors.push(err35);
            }
            errors++;
          }
        }
      } else {
        const err36 = { instancePath, schemaPath: "#/definitions/ContextRetrievalIndexSidecarFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err36];
        } else {
          vErrors.push(err36);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ContextRetrievalIndexSidecarFile_validator();
