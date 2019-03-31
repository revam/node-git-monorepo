import { Plugin } from "rollup";
import { read } from "../util/package";

export default function generateBanner(): Plugin {
  const pkg = read();
  return {
    name: "generate-banner",
    intro() {
      return `/**
 * ${pkg.description || ""}.
 *
 * @package ${pkg.name || "<unknown>"}
 * @version ${pkg.version || "0.0.0"}
 * @homepage ${pkg.homepage || "none"}
 * @license ${pkg.license || "unknown"}
 */`;
    },
  };
}
