import { FetchController, FetchControllerOptions } from "./fetch-controller";
import { LogicController, LogicControllerOptions } from "./logic-controller";
import { ServiceController } from "./main";
import { checkServiceController } from "./main.private";

/**
 * A basic controller combining {@link (LogicController:class)} and
 * {@link (FetchController:class)} into one.
 *
 * @remarks
 *
 * Should **not** be extended.
 *
 * @sealed
 * @public
 */
export class BasicController extends LogicController implements ServiceController {
  public constructor(options?: BasicControllerOptions) {
    super(new FetchController(options), options);
    if (options && options.configure) {
      options.configure(this);
    }
  }

  /**
   * Initialise or use a {@link ServiceController} from `raw`.
   *
   * @remarks
   *
   * `raw` may be an existing controller, a path/url leading to local/remote
   * repositories, or options for constructing a new instance of
   * {@link BasicController}. See the parameters' description for more info.
   *
   * @param raw - {@link FetchControllerOptions.origin | Origin location},
   *              {@link BasicControllerOptions | constructor options} or
   *              {@link ServiceController | an existing controller} to use.
   */
  public static from(raw?: string | ServiceController | BasicControllerOptions): ServiceController {
    if (typeof raw === "string") {
      raw = { origin: raw };
    }
    else if (checkServiceController(raw)) {
      return raw;
    }
    return new BasicController(raw);
  }
}

/**
 * Options for {@link (BasicController:class)}.
 *
 * @public
 */
export interface BasicControllerOptions extends LogicControllerOptions, FetchControllerOptions {
  /**
   * Configure the instance {@link (BasicController:class) | under constructing}.
   *
   * @remarks
   *
   * Used when quick-initalising instances from e.g. middleware factories.
   *
   * @param controller - The {@link (BasicController:class) | constroller} to
   *                     configure.
   */
  configure?(controller: BasicController): void;
}
