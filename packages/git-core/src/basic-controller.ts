import { FetchController, FetchControllerOptions } from "./fetch-controller";
import { LogicController, LogicControllerOptions } from "./logic-controller";
import { ServiceController } from "./main";

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
  }
}

/**
 * Options for {@link (BasicController:class)}.
 *
 * @public
 */
export interface BasicControllerOptions extends LogicControllerOptions, FetchControllerOptions {}
