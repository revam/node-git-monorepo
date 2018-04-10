import { Service } from "git-service";
import { createDriver } from "git-service-driver";
import { IncomingMessage } from "http";
import { createService } from "../src";

describe('createService', () => {
  it('should return an instance of Service', async(done) => {
    // Use a real driver
    const driver = createDriver("/data/repos");
    // Forge a fake request
    const request = new IncomingMessage(void 0);
    request.method = "GET";
    request.url = "/info/refs?service=git-upload-pack";
    request.headers = { Host: "localhost:3000" };
    // Create a new service
    const service = createService(driver, request, void 0);
    expect(service).toBeInstanceOf(Service);
    done();
  });
  it('should throw if fed an invalid driver', async(done) => {
    try {
      // Forge a fake request
      const request = new IncomingMessage(void 0);
      request.method = "GET";
      request.url = "/info/refs?service=git-upload-pack";
      request.headers = { Host: "localhost:3000" };
      const service = createService(void 0, request, void 0);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch("argument `driver` must be a valid service driver interface");
    }
    done();
  });
});

describe('createMiddleware', () => {
  it('should have a test case', async(done) => {
    done();
  });
});
