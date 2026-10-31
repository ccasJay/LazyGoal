var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserSessionMessageResult-validator.cjs
var require_BrowserSessionMessageResult_validator = __commonJS({
  "BrowserSessionMessageResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "message": { "$ref": "#/definitions/BrowserSessionMessageEntry" }, "nextOffset": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 } }, "required": ["ok", "message"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["message_not_found", "goal_not_found"] } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u5355\u6761\u6D88\u606F\u6B63\u6587\u7684 wire \u7ED3\u679C\u3002" };
    var schema13 = { "type": "object", "properties": { "messageId": { "type": "string", "pattern": "\\S" }, "role": { "type": "string", "enum": ["user", "assistant"] }, "runId": { "type": "string", "pattern": "\\S" }, "position": { "$ref": "#/definitions/BrowserMessagePosition" }, "purpose": { "type": "string", "enum": ["process", "answer", "notice"] }, "sourceKind": { "type": "string" }, "sourceId": { "type": "string" }, "content": { "type": "string" }, "contentLength": { "type": "integer", "maximum": 9007199254740991, "minimum": 0 }, "truncated": { "type": "boolean" } }, "required": ["messageId", "role", "runId", "position", "sourceKind", "sourceId", "content", "contentLength", "truncated"], "additionalProperties": false, "description": "\u4F1A\u8BDD\u6D88\u606F\u7684\u516C\u5F00\u6761\u76EE\u3002" };
    var func2 = Object.prototype.hasOwnProperty;
    var pattern0 = new RegExp("\\S", "u");
    function validate12(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.messageId === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "messageId" }, message: "must have required property 'messageId'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.role === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "role" }, message: "must have required property 'role'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.runId === void 0) {
          const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "runId" }, message: "must have required property 'runId'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        if (data.position === void 0) {
          const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "position" }, message: "must have required property 'position'" };
          if (vErrors === null) {
            vErrors = [err3];
          } else {
            vErrors.push(err3);
          }
          errors++;
        }
        if (data.sourceKind === void 0) {
          const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceKind" }, message: "must have required property 'sourceKind'" };
          if (vErrors === null) {
            vErrors = [err4];
          } else {
            vErrors.push(err4);
          }
          errors++;
        }
        if (data.sourceId === void 0) {
          const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "sourceId" }, message: "must have required property 'sourceId'" };
          if (vErrors === null) {
            vErrors = [err5];
          } else {
            vErrors.push(err5);
          }
          errors++;
        }
        if (data.content === void 0) {
          const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "content" }, message: "must have required property 'content'" };
          if (vErrors === null) {
            vErrors = [err6];
          } else {
            vErrors.push(err6);
          }
          errors++;
        }
        if (data.contentLength === void 0) {
          const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "contentLength" }, message: "must have required property 'contentLength'" };
          if (vErrors === null) {
            vErrors = [err7];
          } else {
            vErrors.push(err7);
          }
          errors++;
        }
        if (data.truncated === void 0) {
          const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "truncated" }, message: "must have required property 'truncated'" };
          if (vErrors === null) {
            vErrors = [err8];
          } else {
            vErrors.push(err8);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!func2.call(schema13.properties, key0)) {
            const err9 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
        }
        if (data.messageId !== void 0) {
          let data0 = data.messageId;
          if (typeof data0 === "string") {
            if (!pattern0.test(data0)) {
              const err10 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err10];
              } else {
                vErrors.push(err10);
              }
              errors++;
            }
          } else {
            const err11 = { instancePath: instancePath + "/messageId", schemaPath: "#/properties/messageId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err11];
            } else {
              vErrors.push(err11);
            }
            errors++;
          }
        }
        if (data.role !== void 0) {
          let data1 = data.role;
          if (typeof data1 !== "string") {
            const err12 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err12];
            } else {
              vErrors.push(err12);
            }
            errors++;
          }
          if (!(data1 === "user" || data1 === "assistant")) {
            const err13 = { instancePath: instancePath + "/role", schemaPath: "#/properties/role/enum", keyword: "enum", params: { allowedValues: schema13.properties.role.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err13];
            } else {
              vErrors.push(err13);
            }
            errors++;
          }
        }
        if (data.runId !== void 0) {
          let data2 = data.runId;
          if (typeof data2 === "string") {
            if (!pattern0.test(data2)) {
              const err14 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/pattern", keyword: "pattern", params: { pattern: "\\S" }, message: 'must match pattern "\\S"' };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
          } else {
            const err15 = { instancePath: instancePath + "/runId", schemaPath: "#/properties/runId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err15];
            } else {
              vErrors.push(err15);
            }
            errors++;
          }
        }
        if (data.position !== void 0) {
          let data3 = data.position;
          if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
            if (data3.afterSequence === void 0) {
              const err16 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/required", keyword: "required", params: { missingProperty: "afterSequence" }, message: "must have required property 'afterSequence'" };
              if (vErrors === null) {
                vErrors = [err16];
              } else {
                vErrors.push(err16);
              }
              errors++;
            }
            if (data3.order === void 0) {
              const err17 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/required", keyword: "required", params: { missingProperty: "order" }, message: "must have required property 'order'" };
              if (vErrors === null) {
                vErrors = [err17];
              } else {
                vErrors.push(err17);
              }
              errors++;
            }
            for (const key1 in data3) {
              if (!(key1 === "afterSequence" || key1 === "order")) {
                const err18 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
            if (data3.afterSequence !== void 0) {
              let data4 = data3.afterSequence;
              if (!(typeof data4 == "number" && (!(data4 % 1) && !isNaN(data4)) && isFinite(data4))) {
                const err19 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err19];
                } else {
                  vErrors.push(err19);
                }
                errors++;
              }
              if (typeof data4 == "number" && isFinite(data4)) {
                if (data4 > 9007199254740991 || isNaN(data4)) {
                  const err20 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err20];
                  } else {
                    vErrors.push(err20);
                  }
                  errors++;
                }
                if (data4 < 0 || isNaN(data4)) {
                  const err21 = { instancePath: instancePath + "/position/afterSequence", schemaPath: "#/definitions/BrowserMessagePosition/properties/afterSequence/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err21];
                  } else {
                    vErrors.push(err21);
                  }
                  errors++;
                }
              }
            }
            if (data3.order !== void 0) {
              let data5 = data3.order;
              if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
                const err22 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                if (vErrors === null) {
                  vErrors = [err22];
                } else {
                  vErrors.push(err22);
                }
                errors++;
              }
              if (typeof data5 == "number" && isFinite(data5)) {
                if (data5 > 9007199254740991 || isNaN(data5)) {
                  const err23 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                  if (vErrors === null) {
                    vErrors = [err23];
                  } else {
                    vErrors.push(err23);
                  }
                  errors++;
                }
                if (data5 < 0 || isNaN(data5)) {
                  const err24 = { instancePath: instancePath + "/position/order", schemaPath: "#/definitions/BrowserMessagePosition/properties/order/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                  if (vErrors === null) {
                    vErrors = [err24];
                  } else {
                    vErrors.push(err24);
                  }
                  errors++;
                }
              }
            }
          } else {
            const err25 = { instancePath: instancePath + "/position", schemaPath: "#/definitions/BrowserMessagePosition/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err25];
            } else {
              vErrors.push(err25);
            }
            errors++;
          }
        }
        if (data.purpose !== void 0) {
          let data6 = data.purpose;
          if (typeof data6 !== "string") {
            const err26 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err26];
            } else {
              vErrors.push(err26);
            }
            errors++;
          }
          if (!(data6 === "process" || data6 === "answer" || data6 === "notice")) {
            const err27 = { instancePath: instancePath + "/purpose", schemaPath: "#/properties/purpose/enum", keyword: "enum", params: { allowedValues: schema13.properties.purpose.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err27];
            } else {
              vErrors.push(err27);
            }
            errors++;
          }
        }
        if (data.sourceKind !== void 0) {
          if (typeof data.sourceKind !== "string") {
            const err28 = { instancePath: instancePath + "/sourceKind", schemaPath: "#/properties/sourceKind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err28];
            } else {
              vErrors.push(err28);
            }
            errors++;
          }
        }
        if (data.sourceId !== void 0) {
          if (typeof data.sourceId !== "string") {
            const err29 = { instancePath: instancePath + "/sourceId", schemaPath: "#/properties/sourceId/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err29];
            } else {
              vErrors.push(err29);
            }
            errors++;
          }
        }
        if (data.content !== void 0) {
          if (typeof data.content !== "string") {
            const err30 = { instancePath: instancePath + "/content", schemaPath: "#/properties/content/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
        if (data.contentLength !== void 0) {
          let data10 = data.contentLength;
          if (!(typeof data10 == "number" && (!(data10 % 1) && !isNaN(data10)) && isFinite(data10))) {
            const err31 = { instancePath: instancePath + "/contentLength", schemaPath: "#/properties/contentLength/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err31];
            } else {
              vErrors.push(err31);
            }
            errors++;
          }
          if (typeof data10 == "number" && isFinite(data10)) {
            if (data10 > 9007199254740991 || isNaN(data10)) {
              const err32 = { instancePath: instancePath + "/contentLength", schemaPath: "#/properties/contentLength/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err32];
              } else {
                vErrors.push(err32);
              }
              errors++;
            }
            if (data10 < 0 || isNaN(data10)) {
              const err33 = { instancePath: instancePath + "/contentLength", schemaPath: "#/properties/contentLength/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err33];
              } else {
                vErrors.push(err33);
              }
              errors++;
            }
          }
        }
        if (data.truncated !== void 0) {
          if (typeof data.truncated !== "boolean") {
            const err34 = { instancePath: instancePath + "/truncated", schemaPath: "#/properties/truncated/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err34];
            } else {
              vErrors.push(err34);
            }
            errors++;
          }
        }
      } else {
        const err35 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err35];
        } else {
          vErrors.push(err35);
        }
        errors++;
      }
      validate12.errors = vErrors;
      return errors === 0;
    }
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      const _errs0 = errors;
      let valid0 = false;
      const _errs1 = errors;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.ok === void 0) {
          const err0 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.message === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "message" }, message: "must have required property 'message'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "message" || key0 === "nextOffset")) {
            const err2 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err3 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
          if (true !== data0) {
            const err4 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.message !== void 0) {
          if (!validate12(data.message, { instancePath: instancePath + "/message", parentData: data, parentDataProperty: "message", rootData })) {
            vErrors = vErrors === null ? validate12.errors : vErrors.concat(validate12.errors);
            errors = vErrors.length;
          }
        }
        if (data.nextOffset !== void 0) {
          let data2 = data.nextOffset;
          if (!(typeof data2 == "number" && (!(data2 % 1) && !isNaN(data2)) && isFinite(data2))) {
            const err5 = { instancePath: instancePath + "/nextOffset", schemaPath: "#/anyOf/0/properties/nextOffset/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
          if (typeof data2 == "number" && isFinite(data2)) {
            if (data2 > 9007199254740991 || isNaN(data2)) {
              const err6 = { instancePath: instancePath + "/nextOffset", schemaPath: "#/anyOf/0/properties/nextOffset/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data2 < 0 || isNaN(data2)) {
              const err7 = { instancePath: instancePath + "/nextOffset", schemaPath: "#/anyOf/0/properties/nextOffset/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
          }
        }
      } else {
        const err8 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs9 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err9 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err9];
            } else {
              vErrors.push(err9);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err10 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err10];
            } else {
              vErrors.push(err10);
            }
            errors++;
          }
          for (const key1 in data) {
            if (!(key1 === "ok" || key1 === "error")) {
              const err11 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err11];
              } else {
                vErrors.push(err11);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data3 = data.ok;
            if (typeof data3 !== "boolean") {
              const err12 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err12];
              } else {
                vErrors.push(err12);
              }
              errors++;
            }
            if (false !== data3) {
              const err13 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err13];
              } else {
                vErrors.push(err13);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data4 = data.error;
            if (typeof data4 !== "string") {
              const err14 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err14];
              } else {
                vErrors.push(err14);
              }
              errors++;
            }
            if (!(data4 === "message_not_found" || data4 === "goal_not_found")) {
              const err15 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err15];
              } else {
                vErrors.push(err15);
              }
              errors++;
            }
          }
        } else {
          const err16 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        var _valid0 = _errs9 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err17 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err17];
        } else {
          vErrors.push(err17);
        }
        errors++;
      } else {
        errors = _errs0;
        if (vErrors !== null) {
          if (_errs0) {
            vErrors.length = _errs0;
          } else {
            vErrors = null;
          }
        }
      }
      validate11.errors = vErrors;
      return errors === 0;
    }
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (!validate11(data, { instancePath, parentData, parentDataProperty, rootData })) {
        vErrors = vErrors === null ? validate11.errors : vErrors.concat(validate11.errors);
        errors = vErrors.length;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_BrowserSessionMessageResult_validator();
