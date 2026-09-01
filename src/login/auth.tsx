import api from "./api";
import { getCache, setCache, removeCache } from "../dashboard/cache";

const AUTH_CACHE_KEY = "auth_user";
const TOURNAMENTS_CACHE_PREFIX = "tournaments_";

const checkAuth = async () => {
  try {
    // Always ask the server who is actually logged in — cheap call,
    // and it's the only source of truth for identity.
    const { data } = await api.get("/users/me");

    // If a different user's identity was cached (e.g. someone else
    // logged in on this browser earlier), wipe their leftover data.
    const cachedUser = getCache(AUTH_CACHE_KEY, 1000 * 60 * 5);
    if (cachedUser && cachedUser._id !== data._id) {
      removeCache(AUTH_CACHE_KEY);
      removeCache(`${TOURNAMENTS_CACHE_PREFIX}${cachedUser._id}`);
    }

    setCache(AUTH_CACHE_KEY, data);
    return data;
  } catch (err: any) {
    // On unauthorized, clear cache to avoid stale user
    removeCache(AUTH_CACHE_KEY);
    return null;
  }
};

export default checkAuth;