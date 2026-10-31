var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ProcessStartInput-validator.cjs
var require_ProcessStartInput_validator = __commonJS({
  "ProcessStartInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    var schema12 = { "type": "object", "properties": { "command": { "type": "string", "description": "\u8981\u542F\u52A8\u7684 shell \u547D\u4EE4\u3002" }, "sandboxAccess": { "type": "object", "properties": { "files": { "type": "array", "items": { "type": "object", "properties": { "path": { "type": "string", "description": "\u7533\u8BF7\u8DEF\u5F84\u3002" }, "access": { "type": "string", "enum": ["read", "write"], "description": "\u8BBF\u95EE\u7C7B\u578B\u3002" }, "kind": { "type": "string", "enum": ["file", "directory_tree"], "description": "\u7533\u8BF7\u8303\u56F4\u3002" }, "purpose": { "type": "string", "description": "\u7533\u8BF7\u7528\u9014\u8BF4\u660E\u3002" } }, "required": ["path", "access", "kind", "purpose"], "additionalProperties": false }, "description": "\u989D\u5916\u7533\u8BF7\u7684\u6587\u4EF6\u8BBF\u95EE\u5217\u8868\u3002" }, "network": { "type": "object", "properties": { "targets": { "type": "array", "items": { "type": "string" }, "description": "\u5141\u8BB8\u8BBF\u95EE\u7684\u7F51\u7EDC\u76EE\u6807\u5217\u8868\u3002" }, "purpose": { "type": "string", "description": "\u7533\u8BF7\u7528\u9014\u8BF4\u660E\u3002" } }, "required": ["targets", "purpose"], "additionalProperties": false, "description": "\u53EF\u9009\u7684\u7F51\u7EDC\u8BBF\u95EE\u7533\u8BF7\u3002" } }, "additionalProperties": false, "description": "\u53EF\u9009\u7684\u6C99\u7BB1\u80FD\u529B\u7533\u8BF7\u3002" } }, "required": ["command"], "additionalProperties": false, "description": "`process_start` \u7684\u7ED3\u6784\u5316\u8F93\u5165\u3002" };
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.command === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ProcessStartInput/required", keyword: "required", params: { missingProperty: "command" }, message: "must have required property 'command'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "command" || key0 === "sandboxAccess")) {
            const err1 = { instancePath, schemaPath: "#/definitions/ProcessStartInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.command !== void 0) {
          if (typeof data.command !== "string") {
            const err2 = { instancePath: instancePath + "/command", schemaPath: "#/definitions/ProcessStartInput/properties/command/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err2];
            } else {
              vErrors.push(err2);
            }
            errors++;
          }
        }
        if (data.sandboxAccess !== void 0) {
          let data1 = data.sandboxAccess;
          if (data1 && typeof data1 == "object" && !Array.isArray(data1)) {
            for (const key1 in data1) {
              if (!(key1 === "files" || key1 === "network")) {
                const err3 = { instancePath: instancePath + "/sandboxAccess", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err3];
                } else {
                  vErrors.push(err3);
                }
                errors++;
              }
            }
            if (data1.files !== void 0) {
              let data2 = data1.files;
              if (Array.isArray(data2)) {
                const len0 = data2.length;
                for (let i0 = 0; i0 < len0; i0++) {
                  let data3 = data2[i0];
                  if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                    if (data3.path === void 0) {
                      const err4 = { instancePath: instancePath + "/sandboxAccess/files/" + i0, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/required", keyword: "required", params: { missingProperty: "path" }, message: "must have required property 'path'" };
                      if (vErrors === null) {
                        vErrors = [err4];
                      } else {
                        vErrors.push(err4);
                      }
                      errors++;
                    }
                    if (data3.access === void 0) {
                      const err5 = { instancePath: instancePath + "/sandboxAccess/files/" + i0, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/required", keyword: "required", params: { missingProperty: "access" }, message: "must have required property 'access'" };
                      if (vErrors === null) {
                        vErrors = [err5];
                      } else {
                        vErrors.push(err5);
                      }
                      errors++;
                    }
                    if (data3.kind === void 0) {
                      const err6 = { instancePath: instancePath + "/sandboxAccess/files/" + i0, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
                      if (vErrors === null) {
                        vErrors = [err6];
                      } else {
                        vErrors.push(err6);
                      }
                      errors++;
                    }
                    if (data3.purpose === void 0) {
                      const err7 = { instancePath: instancePath + "/sandboxAccess/files/" + i0, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
                      if (vErrors === null) {
                        vErrors = [err7];
                      } else {
                        vErrors.push(err7);
                      }
                      errors++;
                    }
                    for (const key2 in data3) {
                      if (!(key2 === "path" || key2 === "access" || key2 === "kind" || key2 === "purpose")) {
                        const err8 = { instancePath: instancePath + "/sandboxAccess/files/" + i0, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                        if (vErrors === null) {
                          vErrors = [err8];
                        } else {
                          vErrors.push(err8);
                        }
                        errors++;
                      }
                    }
                    if (data3.path !== void 0) {
                      if (typeof data3.path !== "string") {
                        const err9 = { instancePath: instancePath + "/sandboxAccess/files/" + i0 + "/path", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/properties/path/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err9];
                        } else {
                          vErrors.push(err9);
                        }
                        errors++;
                      }
                    }
                    if (data3.access !== void 0) {
                      let data5 = data3.access;
                      if (typeof data5 !== "string") {
                        const err10 = { instancePath: instancePath + "/sandboxAccess/files/" + i0 + "/access", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/properties/access/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err10];
                        } else {
                          vErrors.push(err10);
                        }
                        errors++;
                      }
                      if (!(data5 === "read" || data5 === "write")) {
                        const err11 = { instancePath: instancePath + "/sandboxAccess/files/" + i0 + "/access", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/properties/access/enum", keyword: "enum", params: { allowedValues: schema12.properties.sandboxAccess.properties.files.items.properties.access.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err11];
                        } else {
                          vErrors.push(err11);
                        }
                        errors++;
                      }
                    }
                    if (data3.kind !== void 0) {
                      let data6 = data3.kind;
                      if (typeof data6 !== "string") {
                        const err12 = { instancePath: instancePath + "/sandboxAccess/files/" + i0 + "/kind", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/properties/kind/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err12];
                        } else {
                          vErrors.push(err12);
                        }
                        errors++;
                      }
                      if (!(data6 === "file" || data6 === "directory_tree")) {
                        const err13 = { instancePath: instancePath + "/sandboxAccess/files/" + i0 + "/kind", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema12.properties.sandboxAccess.properties.files.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                        if (vErrors === null) {
                          vErrors = [err13];
                        } else {
                          vErrors.push(err13);
                        }
                        errors++;
                      }
                    }
                    if (data3.purpose !== void 0) {
                      if (typeof data3.purpose !== "string") {
                        const err14 = { instancePath: instancePath + "/sandboxAccess/files/" + i0 + "/purpose", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err14];
                        } else {
                          vErrors.push(err14);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err15 = { instancePath: instancePath + "/sandboxAccess/files/" + i0, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                    if (vErrors === null) {
                      vErrors = [err15];
                    } else {
                      vErrors.push(err15);
                    }
                    errors++;
                  }
                }
              } else {
                const err16 = { instancePath: instancePath + "/sandboxAccess/files", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/files/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err16];
                } else {
                  vErrors.push(err16);
                }
                errors++;
              }
            }
            if (data1.network !== void 0) {
              let data8 = data1.network;
              if (data8 && typeof data8 == "object" && !Array.isArray(data8)) {
                if (data8.targets === void 0) {
                  const err17 = { instancePath: instancePath + "/sandboxAccess/network", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/required", keyword: "required", params: { missingProperty: "targets" }, message: "must have required property 'targets'" };
                  if (vErrors === null) {
                    vErrors = [err17];
                  } else {
                    vErrors.push(err17);
                  }
                  errors++;
                }
                if (data8.purpose === void 0) {
                  const err18 = { instancePath: instancePath + "/sandboxAccess/network", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/required", keyword: "required", params: { missingProperty: "purpose" }, message: "must have required property 'purpose'" };
                  if (vErrors === null) {
                    vErrors = [err18];
                  } else {
                    vErrors.push(err18);
                  }
                  errors++;
                }
                for (const key3 in data8) {
                  if (!(key3 === "targets" || key3 === "purpose")) {
                    const err19 = { instancePath: instancePath + "/sandboxAccess/network", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err19];
                    } else {
                      vErrors.push(err19);
                    }
                    errors++;
                  }
                }
                if (data8.targets !== void 0) {
                  let data9 = data8.targets;
                  if (Array.isArray(data9)) {
                    const len1 = data9.length;
                    for (let i1 = 0; i1 < len1; i1++) {
                      if (typeof data9[i1] !== "string") {
                        const err20 = { instancePath: instancePath + "/sandboxAccess/network/targets/" + i1, schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/properties/targets/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                        if (vErrors === null) {
                          vErrors = [err20];
                        } else {
                          vErrors.push(err20);
                        }
                        errors++;
                      }
                    }
                  } else {
                    const err21 = { instancePath: instancePath + "/sandboxAccess/network/targets", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/properties/targets/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                    if (vErrors === null) {
                      vErrors = [err21];
                    } else {
                      vErrors.push(err21);
                    }
                    errors++;
                  }
                }
                if (data8.purpose !== void 0) {
                  if (typeof data8.purpose !== "string") {
                    const err22 = { instancePath: instancePath + "/sandboxAccess/network/purpose", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/properties/purpose/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                    if (vErrors === null) {
                      vErrors = [err22];
                    } else {
                      vErrors.push(err22);
                    }
                    errors++;
                  }
                }
              } else {
                const err23 = { instancePath: instancePath + "/sandboxAccess/network", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/properties/network/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err23];
                } else {
                  vErrors.push(err23);
                }
                errors++;
              }
            }
          } else {
            const err24 = { instancePath: instancePath + "/sandboxAccess", schemaPath: "#/definitions/ProcessStartInput/properties/sandboxAccess/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err24];
            } else {
              vErrors.push(err24);
            }
            errors++;
          }
        }
      } else {
        const err25 = { instancePath, schemaPath: "#/definitions/ProcessStartInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err25];
        } else {
          vErrors.push(err25);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ProcessStartInput_validator();
