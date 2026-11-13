var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserPermissionProfileResult-validator.cjs
var require_BrowserPermissionProfileResult_validator = __commonJS({
  "BrowserPermissionProfileResult-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "anyOf": [{ "type": "object", "properties": { "ok": { "type": "boolean", "const": true }, "profile": { "$ref": "#/definitions/BrowserPermissionProfile" }, "revision": { "type": "integer", "maximum": 9007199254740991 } }, "required": ["ok", "profile", "revision"], "additionalProperties": false }, { "type": "object", "properties": { "ok": { "type": "boolean", "const": false }, "error": { "type": "string", "enum": ["permissions_unavailable", "conflict", "service_shutting_down"] }, "profile": { "$ref": "#/definitions/BrowserPermissionProfile", "description": "\u51B2\u7A81\u65F6\u5F53\u524D\u5DF2\u6301\u4E45\u5316\u7684\u6863\u4F4D\u3002" }, "revision": { "type": "integer", "description": "\u51B2\u7A81\u65F6\u5F53\u524D\u5DF2\u6301\u4E45\u5316\u7684\u7248\u672C\u3002", "maximum": 9007199254740991 } }, "required": ["ok", "error"], "additionalProperties": false }], "description": "\u6743\u9650\u6863\u4F4D\u67E5\u8BE2\u6216\u8BBE\u7F6E\u7ED3\u679C\u3002" };
    var schema13 = { "type": "object", "properties": { "sandbox": { "type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"] }, "approvals": { "type": "string", "enum": ["on-request", "never"] }, "reviewer": { "type": "string", "enum": ["user", "auto_review"] }, "writableRoots": { "type": "array", "items": { "type": "string" }, "description": "\u5DE5\u4F5C\u533A\u6811\u4E4B\u5916\u989D\u5916\u5141\u8BB8\u8BFB\u5199\u7684\u5DE5\u4F5C\u533A\u5916\u6839\u76EE\u5F55\uFF0C\u5143\u7D20\u4E3A\u7EDD\u5BF9\u8DEF\u5F84\u3002" } }, "required": ["sandbox", "approvals", "reviewer", "writableRoots"], "additionalProperties": false, "description": "\u5DE5\u4F5C\u533A\u6743\u9650\u6863\u4F4D\u7684 wire \u5F62\u72B6\u3002" };
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
        if (data.profile === void 0) {
          const err1 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "profile" }, message: "must have required property 'profile'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.revision === void 0) {
          const err2 = { instancePath, schemaPath: "#/anyOf/0/required", keyword: "required", params: { missingProperty: "revision" }, message: "must have required property 'revision'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "ok" || key0 === "profile" || key0 === "revision")) {
            const err3 = { instancePath, schemaPath: "#/anyOf/0/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.ok !== void 0) {
          let data0 = data.ok;
          if (typeof data0 !== "boolean") {
            const err4 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
          if (true !== data0) {
            const err5 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/0/properties/ok/const", keyword: "const", params: { allowedValue: true }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.profile !== void 0) {
          let data1 = data.profile;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            if (data1.sandbox === void 0) {
              const err6 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "sandbox" }, message: "must have required property 'sandbox'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            if (data1.approvals === void 0) {
              const err7 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "approvals" }, message: "must have required property 'approvals'" };
              if (vErrors === null) {
                vErrors = [err7];
              } else {
                vErrors.push(err7);
              }
              errors++;
            }
            if (data1.reviewer === void 0) {
              const err8 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "reviewer" }, message: "must have required property 'reviewer'" };
              if (vErrors === null) {
                vErrors = [err8];
              } else {
                vErrors.push(err8);
              }
              errors++;
            }
            if (data1.writableRoots === void 0) {
              const err9 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "writableRoots" }, message: "must have required property 'writableRoots'" };
              if (vErrors === null) {
                vErrors = [err9];
              } else {
                vErrors.push(err9);
              }
              errors++;
            }
            for (const key1 in data1) {
              if (!(key1 === "sandbox" || key1 === "approvals" || key1 === "reviewer" || key1 === "writableRoots")) {
                const err10 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
            }
            if (data1.sandbox !== void 0) {
              let data2 = data1.sandbox;
              if (typeof data2 !== "string") {
                const err11 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
              if (!(data2 === "read-only" || data2 === "workspace-write" || data2 === "danger-full-access")) {
                const err12 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/enum", keyword: "enum", params: { allowedValues: schema13.properties.sandbox.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
            }
            if (data1.approvals !== void 0) {
              let data3 = data1.approvals;
              if (typeof data3 !== "string") {
                const err13 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
              if (!(data3 === "on-request" || data3 === "never")) {
                const err14 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/enum", keyword: "enum", params: { allowedValues: schema13.properties.approvals.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err14];
                } else {
                  vErrors.push(err14);
                }
                errors++;
              }
            }
            if (data1.reviewer !== void 0) {
              let data4 = data1.reviewer;
              if (typeof data4 !== "string") {
                const err15 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
              if (!(data4 === "user" || data4 === "auto_review")) {
                const err16 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/enum", keyword: "enum", params: { allowedValues: schema13.properties.reviewer.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data1.writableRoots !== void 0) {
              let data5 = data1.writableRoots;
              if (Array.isArray(data5)) {
                const len0 = data5.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (typeof data5[i0] !== "string") {
                    const err17 = { instancePath: instancePath + "/profile/writableRoots/" + i0, schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err17];
                    } else {
                      vErrors.push(err17);
                    }
                    errors++;
                  }
                }
              } else {
                const err18 = { instancePath: instancePath + "/profile/writableRoots", schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err18];
                } else {
                  vErrors.push(err18);
                }
                errors++;
              }
            }
          } else {
            const err19 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data.revision !== void 0) {
          let data7 = data.revision;
          if (!(typeof data7 == "number" && (!(data7 % 1) && !isNaN(data7)) && isFinite(data7))) {
            const err20 = { instancePath: instancePath + "/revision", schemaPath: "#/anyOf/0/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err20];
            } else {
              vErrors.push(err20);
            }
            errors++;
          }
          if (typeof data7 == "number" && isFinite(data7)) {
            if (data7 > 9007199254740991 || isNaN(data7)) {
              const err21 = { instancePath: instancePath + "/revision", schemaPath: "#/anyOf/0/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err21];
              } else {
                vErrors.push(err21);
              }
              errors++;
            }
          }
        }
      } else {
        const err22 = { instancePath, schemaPath: "#/anyOf/0/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err22];
        } else {
          vErrors.push(err22);
        }
        errors++;
      }
      var _valid0 = _errs1 === errors;
      valid0 = valid0 || _valid0;
      if (!valid0) {
        const _errs22 = errors;
        if (data && typeof data == "object" && !Array.isArray(data)) {
          if (data.ok === void 0) {
            const err23 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "ok" }, message: "must have required property 'ok'" };
            if (vErrors === null) {
              vErrors = [err23];
            } else {
              vErrors.push(err23);
            }
            errors++;
          }
          if (data.error === void 0) {
            const err24 = { instancePath, schemaPath: "#/anyOf/1/required", keyword: "required", params: { missingProperty: "error" }, message: "must have required property 'error'" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
          for (const key2 in data) {
            if (!(key2 === "ok" || key2 === "error" || key2 === "profile" || key2 === "revision")) {
              const err25 = { instancePath, schemaPath: "#/anyOf/1/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
              if (vErrors === null) {
                vErrors = [err25];
              } else {
                vErrors.push(err25);
              }
              errors++;
            }
          }
          if (data.ok !== void 0) {
            let data8 = data.ok;
            if (typeof data8 !== "boolean") {
              const err26 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
              if (vErrors === null) {
                vErrors = [err26];
              } else {
                vErrors.push(err26);
              }
              errors++;
            }
            if (false !== data8) {
              const err27 = { instancePath: instancePath + "/ok", schemaPath: "#/anyOf/1/properties/ok/const", keyword: "const", params: { allowedValue: false }, message: "must be equal to constant" };
              if (vErrors === null) {
                vErrors = [err27];
              } else {
                vErrors.push(err27);
              }
              errors++;
            }
          }
          if (data.error !== void 0) {
            let data9 = data.error;
            if (typeof data9 !== "string") {
              const err28 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/type", keyword: "type", params: { type: "string" }, message: "must be string" };
              if (vErrors === null) {
                vErrors = [err28];
              } else {
                vErrors.push(err28);
              }
              errors++;
            }
            if (!(data9 === "permissions_unavailable" || data9 === "conflict" || data9 === "service_shutting_down")) {
              const err29 = { instancePath: instancePath + "/error", schemaPath: "#/anyOf/1/properties/error/enum", keyword: "enum", params: { allowedValues: schema12.anyOf[1].properties.error.enum }, message: "must be equal to one of the allowed values" };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          }
          if (data.profile !== void 0) {
            let data10 = data.profile;
            if (data10 && typeof data10 == "object" && !Array.isArray(data10)) {
              if (data10.sandbox === void 0) {
                const err30 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "sandbox" }, message: "must have required property 'sandbox'" };
                if (vErrors === null) {
                  vErrors = [err30];
                } else {
                  vErrors.push(err30);
                }
                errors++;
              }
              if (data10.approvals === void 0) {
                const err31 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "approvals" }, message: "must have required property 'approvals'" };
                if (vErrors === null) {
                  vErrors = [err31];
                } else {
                  vErrors.push(err31);
                }
                errors++;
              }
              if (data10.reviewer === void 0) {
                const err32 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "reviewer" }, message: "must have required property 'reviewer'" };
                if (vErrors === null) {
                  vErrors = [err32];
                } else {
                  vErrors.push(err32);
                }
                errors++;
              }
              if (data10.writableRoots === void 0) {
                const err33 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "writableRoots" }, message: "must have required property 'writableRoots'" };
                if (vErrors === null) {
                  vErrors = [err33];
                } else {
                  vErrors.push(err33);
                }
                errors++;
              }
              for (const key3 in data10) {
                if (!(key3 === "sandbox" || key3 === "approvals" || key3 === "reviewer" || key3 === "writableRoots")) {
                  const err34 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                  if (vErrors === null) {
                    vErrors = [err34];
                  } else {
                    vErrors.push(err34);
                  }
                  errors++;
                }
              }
              if (data10.sandbox !== void 0) {
                let data11 = data10.sandbox;
                if (typeof data11 !== "string") {
                  const err35 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err35];
                  } else {
                    vErrors.push(err35);
                  }
                  errors++;
                }
                if (!(data11 === "read-only" || data11 === "workspace-write" || data11 === "danger-full-access")) {
                  const err36 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/enum", keyword: "enum", params: { allowedValues: schema13.properties.sandbox.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err36];
                  } else {
                    vErrors.push(err36);
                  }
                  errors++;
                }
              }
              if (data10.approvals !== void 0) {
                let data12 = data10.approvals;
                if (typeof data12 !== "string") {
                  const err37 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err37];
                  } else {
                    vErrors.push(err37);
                  }
                  errors++;
                }
                if (!(data12 === "on-request" || data12 === "never")) {
                  const err38 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/enum", keyword: "enum", params: { allowedValues: schema13.properties.approvals.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err38];
                  } else {
                    vErrors.push(err38);
                  }
                  errors++;
                }
              }
              if (data10.reviewer !== void 0) {
                let data13 = data10.reviewer;
                if (typeof data13 !== "string") {
                  const err39 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                  if (vErrors === null) {
                    vErrors = [err39];
                  } else {
                    vErrors.push(err39);
                  }
                  errors++;
                }
                if (!(data13 === "user" || data13 === "auto_review")) {
                  const err40 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/enum", keyword: "enum", params: { allowedValues: schema13.properties.reviewer.enum }, message: "must be equal to one of the allowed values" };
                  if (vErrors === null) {
                    vErrors = [err40];
                  } else {
                    vErrors.push(err40);
                  }
                  errors++;
                }
              }
              if (data10.writableRoots !== void 0) {
                let data14 = data10.writableRoots;
                if (Array.isArray(data14)) {
                  const len1 = data14.length;
                  for (let i1 = 0; i1 < len1; i1++) {
                    if (typeof data14[i1] !== "string") {
                      const err41 = { instancePath: instancePath + "/profile/writableRoots/" + i1, schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                      if (vErrors === null) {
                        vErrors = [err41];
                      } else {
                        vErrors.push(err41);
                      }
                      errors++;
                    }
                  }
                } else {
                  const err42 = { instancePath: instancePath + "/profile/writableRoots", schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                  if (vErrors === null) {
                    vErrors = [err42];
                  } else {
                    vErrors.push(err42);
                  }
                  errors++;
                }
              }
            } else {
              const err43 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
          }
          if (data.revision !== void 0) {
            let data16 = data.revision;
            if (!(typeof data16 == "number" && (!(data16 % 1) && !isNaN(data16)) && isFinite(data16))) {
              const err44 = { instancePath: instancePath + "/revision", schemaPath: "#/anyOf/1/properties/revision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
            if (typeof data16 == "number" && isFinite(data16)) {
              if (data16 > 9007199254740991 || isNaN(data16)) {
                const err45 = { instancePath: instancePath + "/revision", schemaPath: "#/anyOf/1/properties/revision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
                if (vErrors === null) {
                  vErrors = [err45];
                } else {
                  vErrors.push(err45);
                }
                errors++;
              }
            }
          }
        } else {
          const err46 = { instancePath, schemaPath: "#/anyOf/1/type", keyword: "type", params: { type: "object" }, message: "must be object" };
          if (vErrors === null) {
            vErrors = [err46];
          } else {
            vErrors.push(err46);
          }
          errors++;
        }
        var _valid0 = _errs22 === errors;
        valid0 = valid0 || _valid0;
      }
      if (!valid0) {
        const err47 = { instancePath, schemaPath: "#/anyOf", keyword: "anyOf", params: {}, message: "must match a schema in anyOf" };
        if (vErrors === null) {
          vErrors = [err47];
        } else {
          vErrors.push(err47);
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
export default require_BrowserPermissionProfileResult_validator();
