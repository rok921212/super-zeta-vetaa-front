import { decode } from '@msgpack/msgpack';
import { remapProtoTeam } from '../dashboard/matchTeamMerge.ts';

// Shared by PublicThemeRenderer and the external overlay client
// (./client.ts) so both decode the live socket feed identically.
//
// Backend (protobufCodec.js) prefixes every protobuf payload with this byte
// so the client can tell it apart from a plain msgpack payload arriving on
// the SAME event name from the user:${userId} room (a socket can be in both
// rooms at once, e.g. an operator viewing the overlay in their own logged-in
// tab) — 0xC1 is formally reserved/"never used" by the msgpack spec, so no
// genuine msgpack stream this codebase produces can ever start with it.
export const PROTOBUF_MARKER_BYTE = 0xc1;

// decodeWireMessage(raw, overlayProto.MatchDataPayload) /
// decodeWireMessage(raw, overlayProto.OverallDataPayload) — each event
// handler knows its own message type, so the type is passed in rather than
// inferred (protobuf bytes carry no self-describing type tag the way
// msgpack's leading byte does).
export const decodeWireMessage = (raw: unknown, ProtoType: any): any => {
  if (raw instanceof ArrayBuffer || raw instanceof Uint8Array) {
    const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : raw;
    if (bytes.length > 0 && bytes[0] === PROTOBUF_MARKER_BYTE) {
      try {
        const decoded = ProtoType.decode(bytes.subarray(1));
        const obj: any = ProtoType.toObject(decoded, { defaults: true, longs: String });
        if (Array.isArray(obj.teams)) obj.teams = obj.teams.map(remapProtoTeam);
        return obj;
      } catch (err) {
        console.error('[bw][overlay] protobuf decode failed:', err, bytes);
        return null;
      }
    }
    // Not protobuf-marked -> msgpack, either because this socket hasn't
    // negotiated protobuf for this room yet, or because it's arriving via
    // the user:${userId} room's separately-negotiated msgpack path.
    try {
      return decode(bytes);
    } catch (err) {
      console.error('[bw][overlay] msgpack decode failed:', err, bytes);
      return null;
    }
  }
  return raw;
};
