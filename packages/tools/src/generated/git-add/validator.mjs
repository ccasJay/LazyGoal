var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};

// GitAddInput-validator.cjs
var require_GitAddInput_validator = __commonJS({
  "GitAddInput-validator.cjs"(exports, module) {
    module.exports = validate10;
    module.exports.default = validate10;
    function validate10(data, { instancePath = "", parentData, parentDataProperty, rootData = data } = {}) {
      ;
      let vErrors = null;
      let errors = 0;
      if (data && typeof data == "object" && !Array.isArray(data)) {
        if (data.paths === void 0) {
          const err0 = { instancePath, schemaPath: "#/definitions/GitAddInput/required", keyword: "required", params: { missingProperty: "paths" }, message: "must have required property 'paths'" };
          if (vErrors === null) {
            vErrors = [err0];
          } else {
            vErrors.push(err0);
          }
          errors++;
        }
        for (const key0 in data) {
          if (!(key0 === "paths" || key0 === "repoPath")) {
            const err1 = { instancePath, schemaPath: "#/definitions/GitAddInput/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err1];
            } else {
              vErrors.push(err1);
            }
            errors++;
          }
        }
        if (data.paths !== void 0) {
          let data0 = data.paths;
          if (Array.isArray(data0)) {
            const len0 = data0.length;
            for (let i0 = 0; i0 < len0; i0++) {
              if (typeof data0[i0] !== "string") {
                const err2 = { instancePath: instancePath + "/paths/" + i0, schemaPath: "#/definitions/GitAddInput/properties/paths/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err2];
                } else {
                  vErrors.push(err2);
                }
                errors++;
              }
            }
          } else {
            const err3 = { instancePath: instancePath + "/paths", schemaPath: "#/definitions/GitAddInput/properties/paths/type", keyword: "type", params: { type: "array" }, message: "must be array" };
            if (vErrors === null) {
              vErrors = [err3];
            } else {
              vErrors.push(err3);
            }
            errors++;
          }
        }
        if (data.repoPath !== void 0) {
          if (typeof data.repoPath !== "string") {
            const err4 = { instancePath: instancePath + "/repoPath", schemaPath: "#/definitions/GitAddInput/properties/repoPath/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err4];
            } else {
              vErrors.push(err4);
            }
            errors++;
          }
        }
      } else {
        const err5 = { instancePath, schemaPath: "#/definitions/GitAddInput/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err5];
        } else {
          vErrors.push(err5);
        }
        errors++;
      }
      validate10.errors = vErrors;
      return errors === 0;
    }
  }
});
export default require_GitAddInput_validator();
