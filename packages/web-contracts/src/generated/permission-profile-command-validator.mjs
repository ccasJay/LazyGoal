var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// BrowserPermissionProfileCommand-validator.cjs
var require_BrowserPermissionProfileCommand_validator = __commonJS({
  "BrowserPermissionProfileCommand-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema13 = { "type": "object", "properties": { "sandbox": { "type": "string", "enum": ["read-only", "workspace-write", "danger-full-access"] }, "approvals": { "type": "string", "enum": ["on-request", "never"] }, "reviewer": { "type": "string", "enum": ["user", "auto_review"] }, "writableRoots": { "type": "array", "items": { "type": "string" }, "description": "\u5DE5\u4F5C\u533A\u6811\u4E4B\u5916\u989D\u5916\u5141\u8BB8\u8BFB\u5199\u7684\u5DE5\u4F5C\u533A\u5916\u6839\u76EE\u5F55\uFF0C\u5143\u7D20\u4E3A\u7EDD\u5BF9\u8DEF\u5F84\u3002" } }, "required": ["sandbox", "approvals", "reviewer", "writableRoots"], "additionalProperties": false, "description": "\u5DE5\u4F5C\u533A\u6743\u9650\u6863\u4F4D\u7684 wire \u5F62\u72B6\u3002" };
    function validate11(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.profile === void 0) {
          const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "profile" }, message: "must have required property 'profile'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.expectedRevision === void 0) {
          const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "expectedRevision" }, message: "must have required property 'expectedRevision'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "profile" || key0 === "expectedRevision")) {
            const err2 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.profile !== void 0) {
          let data0 = data.profile;
          if (data0 && typeof data0 == "object" && !Array.isArray(data0)) {
            if (data0.sandbox === void 0) {
              const err3 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "sandbox" }, message: "must have required property 'sandbox'" };
              if (vErrors === null) {
                vErrors = [err3];
              } else {
                vErrors.push(err3);
              }
              errors++;
            }
            if (data0.approvals === void 0) {
              const err4 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "approvals" }, message: "must have required property 'approvals'" };
              if (vErrors === null) {
                vErrors = [err4];
              } else {
                vErrors.push(err4);
              }
              errors++;
            }
            if (data0.reviewer === void 0) {
              const err5 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "reviewer" }, message: "must have required property 'reviewer'" };
              if (vErrors === null) {
                vErrors = [err5];
              } else {
                vErrors.push(err5);
              }
              errors++;
            }
            if (data0.writableRoots === void 0) {
              const err6 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/required", keyword: "required", params: { missingProperty: "writableRoots" }, message: "must have required property 'writableRoots'" };
              if (vErrors === null) {
                vErrors = [err6];
              } else {
                vErrors.push(err6);
              }
              errors++;
            }
            for (const key1 in data0) {
              if (!(key1 === "sandbox" || key1 === "approvals" || key1 === "reviewer" || key1 === "writableRoots")) {
                const err7 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err7];
                } else {
                  vErrors.push(err7);
                }
                errors++;
              }
            }
            if (data0.sandbox !== void 0) {
              let data1 = data0.sandbox;
              if (typeof data1 !== "string") {
                const err8 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err8];
                } else {
                  vErrors.push(err8);
                }
                errors++;
              }
              if (!(data1 === "read-only" || data1 === "workspace-write" || data1 === "danger-full-access")) {
                const err9 = { instancePath: instancePath + "/profile/sandbox", schemaPath: "#/definitions/BrowserPermissionProfile/properties/sandbox/enum", keyword: "enum", params: { allowedValues: schema13.properties.sandbox.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err9];
                } else {
                  vErrors.push(err9);
                }
                errors++;
              }
            }
            if (data0.approvals !== void 0) {
              let data2 = data0.approvals;
              if (typeof data2 !== "string") {
                const err10 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err10];
                } else {
                  vErrors.push(err10);
                }
                errors++;
              }
              if (!(data2 === "on-request" || data2 === "never")) {
                const err11 = { instancePath: instancePath + "/profile/approvals", schemaPath: "#/definitions/BrowserPermissionProfile/properties/approvals/enum", keyword: "enum", params: { allowedValues: schema13.properties.approvals.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err11];
                } else {
                  vErrors.push(err11);
                }
                errors++;
              }
            }
            if (data0.reviewer !== void 0) {
              let data3 = data0.reviewer;
              if (typeof data3 !== "string") {
                const err12 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err12];
                } else {
                  vErrors.push(err12);
                }
                errors++;
              }
              if (!(data3 === "user" || data3 === "auto_review")) {
                const err13 = { instancePath: instancePath + "/profile/reviewer", schemaPath: "#/definitions/BrowserPermissionProfile/properties/reviewer/enum", keyword: "enum", params: { allowedValues: schema13.properties.reviewer.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
            if (data0.writableRoots !== void 0) {
              let data4 = data0.writableRoots;
              if (Array.isArray(data4)) {
                const len0 = data4.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  if (typeof data4[i0] !== "string") {
                    const err14 = { instancePath: instancePath + "/profile/writableRoots/" + i0, schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err14];
                    } else {
                      vErrors.push(err14);
                    }
                    errors++;
                  }
                }
              } else {
                const err15 = { instancePath: instancePath + "/profile/writableRoots", schemaPath: "#/definitions/BrowserPermissionProfile/properties/writableRoots/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err15];
                } else {
                  vErrors.push(err15);
                }
                errors++;
              }
            }
          } else {
            const err16 = { instancePath: instancePath + "/profile", schemaPath: "#/definitions/BrowserPermissionProfile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err16];
            } else {
              vErrors.push(err16);
            }
            errors++;
          }
        }
        if (data.expectedRevision !== void 0) {
          let data6 = data.expectedRevision;
          if (!(typeof data6 == "number" && (!(data6 % 1) && !isNaN(data6)) && isFinite(data6))) {
            const err17 = { instancePath: instancePath + "/expectedRevision", schemaPath: "#/properties/expectedRevision/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
          if (typeof data6 == "number" && isFinite(data6)) {
            if (data6 > 9007199254740991 || isNaN(data6)) {
              const err18 = { instancePath: instancePath + "/expectedRevision", schemaPath: "#/properties/expectedRevision/maximum", keyword: "maximum", params: { comparison: "<=", limit: 9007199254740991 }, message: "must be <= 9007199254740991" };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
            if (data6 < 0 || isNaN(data6)) {
              const err19 = { instancePath: instancePath + "/expectedRevision", schemaPath: "#/properties/expectedRevision/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
              if (vErrors === null) {
                vErrors = [err19];
              } else {
                vErrors.push(err19);
              }
              errors++;
            }
          }
        }
      } else {
        const err20 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
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
export default require_BrowserPermissionProfileCommand_validator();
