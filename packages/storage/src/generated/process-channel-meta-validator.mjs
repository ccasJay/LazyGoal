var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// ProcessChannelMetaFile-validator.cjs
var require_ProcessChannelMetaFile_validator = __commonJS({
  "ProcessChannelMetaFile-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.headOffset === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/ProcessChannelMetaFile/required", keyword: "required", params: { missingProperty: "headOffset" }, message: "must have required property 'headOffset'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        if (data.tailOffset === void 0) {
          const err1 = { instancePath, schemaPath: "#/definitions/ProcessChannelMetaFile/required", keyword: "required", params: { missingProperty: "tailOffset" }, message: "must have required property 'tailOffset'" };
          if (vErrors === null) {
            vErrors = [err1];
          } else {
            vErrors.push(err1);
          }
          errors++;
        }
        if (data.parts === void 0) {
          const err2 = { instancePath, schemaPath: "#/definitions/ProcessChannelMetaFile/required", keyword: "required", params: { missingProperty: "parts" }, message: "must have required property 'parts'" };
          if (vErrors === null) {
            vErrors = [err2];
          } else {
            vErrors.push(err2);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "headOffset" || key0 === "tailOffset" || key0 === "parts")) {
            const err3 = { instancePath, schemaPath: "#/definitions/ProcessChannelMetaFile/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.headOffset !== void 0) {
          let data0 = data.headOffset;
          if (!(typeof data0 == "number" && isFinite(data0))) {
            const err4 = { instancePath: instancePath + "/headOffset", schemaPath: "#/definitions/ProcessChannelMetaFile/properties/headOffset/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
        if (data.tailOffset !== void 0) {
          let data1 = data.tailOffset;
          if (!(typeof data1 == "number" && isFinite(data1))) {
            const err5 = { instancePath: instancePath + "/tailOffset", schemaPath: "#/definitions/ProcessChannelMetaFile/properties/tailOffset/type", keyword: "type", params: { type: "number" }, message: "must be number" };
            if (vErrors === null) {
              vErrors = [err5];
            } else {
              vErrors.push(err5);
            }
            errors++;
          }
        }
        if (data.parts !== void 0) {
          let data2 = data.parts;
          if (Array.isArray(data2)) {
            const len0 = data2.length;
            for (let i0 = 0; i0 < len0; i0++) {
              let data3 = data2[i0];
              if (data3 && typeof data3 == "object" && !Array.isArray(data3)) {
                if (data3.index === void 0) {
                  const err6 = { instancePath: instancePath + "/parts/" + i0, schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/required", keyword: "required", params: { missingProperty: "index" }, message: "must have required property 'index'" };
                  if (vErrors === null) {
                    vErrors = [err6];
                  } else {
                    vErrors.push(err6);
                  }
                  errors++;
                }
                if (data3.startOffset === void 0) {
                  const err7 = { instancePath: instancePath + "/parts/" + i0, schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/required", keyword: "required", params: { missingProperty: "startOffset" }, message: "must have required property 'startOffset'" };
                  if (vErrors === null) {
                    vErrors = [err7];
                  } else {
                    vErrors.push(err7);
                  }
                  errors++;
                }
                if (data3.bytes === void 0) {
                  const err8 = { instancePath: instancePath + "/parts/" + i0, schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/required", keyword: "required", params: { missingProperty: "bytes" }, message: "must have required property 'bytes'" };
                  if (vErrors === null) {
                    vErrors = [err8];
                  } else {
                    vErrors.push(err8);
                  }
                  errors++;
                }
                for (const key1 in data3) {
                  if (!(key1 === "index" || key1 === "startOffset" || key1 === "bytes")) {
                    const err9 = { instancePath: instancePath + "/parts/" + i0, schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
                    if (vErrors === null) {
                      vErrors = [err9];
                    } else {
                      vErrors.push(err9);
                    }
                    errors++;
                  }
                }
                if (data3.index !== void 0) {
                  let data4 = data3.index;
                  if (!(typeof data4 == "number" && isFinite(data4))) {
                    const err10 = { instancePath: instancePath + "/parts/" + i0 + "/index", schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/properties/index/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err10];
                    } else {
                      vErrors.push(err10);
                    }
                    errors++;
                  }
                }
                if (data3.startOffset !== void 0) {
                  let data5 = data3.startOffset;
                  if (!(typeof data5 == "number" && isFinite(data5))) {
                    const err11 = { instancePath: instancePath + "/parts/" + i0 + "/startOffset", schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/properties/startOffset/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err11];
                    } else {
                      vErrors.push(err11);
                    }
                    errors++;
                  }
                }
                if (data3.bytes !== void 0) {
                  let data6 = data3.bytes;
                  if (!(typeof data6 == "number" && isFinite(data6))) {
                    const err12 = { instancePath: instancePath + "/parts/" + i0 + "/bytes", schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/properties/bytes/type", keyword: "type", params: { type: "number" }, message: "must be number" };
                    if (vErrors === null) {
                      vErrors = [err12];
                    } else {
                      vErrors.push(err12);
                    }
                    errors++;
                  }
                }
              } else {
                const err13 = { instancePath: instancePath + "/parts/" + i0, schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
                if (vErrors === null) {
                  vErrors = [err13];
                } else {
                  vErrors.push(err13);
                }
                errors++;
              }
            }
          } else {
            const err14 = { instancePath: instancePath + "/parts", schemaPath: "#/definitions/ProcessChannelMetaFile/properties/parts/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err14];
            } else {
              vErrors.push(err14);
            }
            errors++;
          }
        }
      } else {
        const err15 = { instancePath, schemaPath: "#/definitions/ProcessChannelMetaFile/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err15];
        } else {
          vErrors.push(err15);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_ProcessChannelMetaFile_validator();
