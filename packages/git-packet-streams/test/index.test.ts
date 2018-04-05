import { Duplex, PassThrough, Readable } from "stream";
import { createPacketInspectStream, createPacketReadableStream } from "../src";

describe('createPacketReadableStream', () => {
  it(
    'It should return an instance of stream.Readable',
    async(done) => {
      const instance = createPacketReadableStream([Buffer.from("0000")]);
      expect(instance).toBeInstanceOf(Readable);
      done();
    },
  );
  /**
   * It should accept a buffer list as first arguement, and optionally an index as second argument.
   * Buffers **must** contain only valid packets.
   */
  it(
    'It should accept a list of buffers as first argument, and optionally an index as second argument',
    async(done) => {
      const source = [
        Buffer.from("0008test00000007abc"),
        Buffer.from("000apacket"),
      ];
      const results = [
        [
          Buffer.from("0008test"),
          Buffer.from("0000"),
          Buffer.from("0007abc"),
          Buffer.from("000apacket"),
        ],
        [
          Buffer.from("0008test"),
          Buffer.from("000apacket"),
          Buffer.from("0000"),
          Buffer.from("0007abc"),
        ],
      ];
      await Promise.all(results.map(async(r, i) => {
        let j = 0;
        const packets = createPacketReadableStream(source, i - 1);
        const [inspect, promise] = createPacketInspectStream((b) => {
          const a = r[j++];
          expect(b.equals(a)).toBeTruthy();
        });
        packets.pipe(inspect);
        await promise;
      }));
      done();
    },
  );
  it('should throw on invalid packets', async(done) => {
    const packets = createPacketReadableStream([Buffer.from('Not a packet stream')]);
    packets.on(
      'error',
      (err) => expect(err.message).toMatch('Invalid packet starting at position 0 in buffer (19)'),
    );
    packets.pipe(new PassThrough());
    done();
  });
  it('should throw when packet length is greater then the length of the remaining buffer', async(done) => {
    const packets = createPacketReadableStream([Buffer.from('000apack')]);
    packets.on(
      'error',
      (err) => expect(err.message).toMatch('Invalid packet ending at position 10 in buffer (8)'),
    );
    packets.pipe(new PassThrough());
    done();
  });
});

describe('createPacketInspectStream', () => {
  /**
   * It should return an instance of stream.Duplex and a promise resolving when first packets load is done
   */
  it(
    'It should return an instance of stream.Duplex and a promise resolving when first packets load is done',
    async(done) => {
      const [instance, promise] = createPacketInspectStream(() => void 0);
      expect(instance).toBeInstanceOf(Duplex);
      expect(promise).toBeInstanceOf(Promise);
      done();
    },
  );

  it('should throw on invalid packets', async(done) => {
    const packets = createReabableBufferStream([Buffer.from('00')]);
    const [inspect, promise] = createPacketInspectStream(() => void 0);
    let error: Error;
    inspect.on('error', (err) => expect(error = err).toBeInstanceOf(Error));
    packets.pipe(inspect);
    await Promise.all([
      promise,
      new Promise<void>((resolve) => inspect.on('error', resolve)),
    ]);
    expect(error.message).toMatch('Invalid packet starting at position 0 in buffer (2)');
    done();
  });

  /**
   * It should read out all packets to the supplied handler
   */
  it(
    'It should read out all packets to the supplied handler',
    async(done) => {
      const source = [
        Buffer.from("0008test00000007abc"),
        Buffer.from("000apacket"),
      ];

      const results = [
        Buffer.from("0008test"),
        Buffer.from("0000"),
        Buffer.from("0007abc"),
        Buffer.from("000apacket"),
      ];

      let i = 0;
      const packets = createPacketReadableStream(source);
      const [readPackets, promise] = createPacketInspectStream((b) => expect(b.equals(results[i++])).toBeTruthy());
      packets.pipe(readPackets);
      await promise;
      done();
    },
  );

  /**
   * It should read out all packets to the supplied handler
   */
  it(
    'It should not care for split packet chuncks, and seamlessly combining them',
    async(done) => {
      const source = [
        Buffer.from("0008te"),
        Buffer.from("st"),
        Buffer.from("000a"),
        Buffer.from("pac"),
        Buffer.from("ket"),
      ];

      const results = [
        Buffer.from("0008test"),
        Buffer.from("000apacket"),
      ];

      let i = 0;
      const packets = createReabableBufferStream(source);
      const [readPackets, promise] = createPacketInspectStream((b) => expect(b.equals(results[i++])).toBeTruthy());
      packets.pipe(readPackets);
      await promise;
      done();
    },
  );

  it(
    'should still throw if packet cannot be completed with available chuncks',
    async(done) => {
      const source = [
        Buffer.from("0008te"),
      ];

      const results = [
        Buffer.from("0008test"),
        Buffer.from("000apacket"),
      ];

      const packets = createReabableBufferStream(source);
      const [readPackets, promise] = createPacketInspectStream((b) => void 0);
      readPackets.on(
        'error',
        (err) => expect(err.message).toMatch('Incomplete packet with length 8 remaining in buffer (6)'),
      );
      packets.pipe(readPackets);
      await promise;
      done();
    },
  );
});

function createReabableBufferStream(buffers: Buffer[]): Readable {
  const iterator = buffers[Symbol.iterator]();
  return new Readable({ read() {
    const {value, done} = iterator.next();
    if (!done) {
      this.push(value);
    } else {
      this.push(null);
    }
  } });
}
