import invariant from "invariant";

////////////////////////////////////////////////////////////////////////////////
// startsWith(string, search) - Check if `string` starts with `search`
let startsWith = (string, search) => {
  return string.substr(0, search.length) === search;
};

////////////////////////////////////////////////////////////////////////////////
// pick(routes, uri)
//
// Ranks and picks the best route to match. Each segment gets the highest
// amount of points, then the type of segment gets an additional amount of
// points where
//
//     static > dynamic > splat > root
//
// This way we don't have to worry about the order of our routes, let the
// computers do it.
//
// A route looks like this
//
//     { path, default, value }
//
// And a returned match looks like:
//
//     { route, params, uri }
//
// I know, I should use TypeScript not comments for these types.
let pick = (routes, uri) => {
  const test = document.getElementById("test");
  test.innerHTML += `__${uri} __`;
  let match = null;
  let default_ = null;
  test.innerHTML += "__进入 pick 内部__";

  let uriPathname = uri.split("?")[0];
  test.innerHTML += `__${uriPathname} __`;
  // 把 ppathname.split('/')
  let uriSegments = segmentize(uriPathname);
  test.innerHTML += `__进入${JSON.stringify(uriSegments)} __`;
  // 是不是根路径
  let isRootUri = uriSegments[0] === "";
  // 把所有路由转数组按路径长度排序   'mp/homepage/home'.split('/')  length=3
  let ranked = rankRoutes(routes);

  test.innerHTML += "__进入大循环__";
  for (let i = 0, l = ranked.length; i < l; i++) {
    let missed = false;
    let route = ranked[i].route;

    if (route.default) {
      default_ = {
        route,
        params: {},
        uri
      };
      continue;
    }

    // 转每个路由的路径为数组   'mp/homepage/home'.split('/')
    let routeSegments = segmentize(route.path);
    let params = {};
    // 单纯取最大值满足双循环  routeSegments uriSegments 就都能循环完成
    let max = Math.max(uriSegments.length, routeSegments.length);
    let index = 0;

    test.innerHTML += "__进入小循环__";
    for (; index < max; index++) {
      let routeSegment = routeSegments[index];
      let uriSegment = uriSegments[index];

      let isSplat = routeSegment === "*";

      // 'mp/homepage/v2/*/home'  ==>  home
      // '*/mp/homepage/v2/home'  ==>  mp/homepage/v2/home
      if (isSplat) {
        // Hit a splat, just grab the rest, and return a match

        // 结果 uri:   /files/documents/work
        // 结果 route: /files/*
        params["*"] = uriSegments
          .slice(index)
          .map(decodeURIComponent)
          .join("/");
        break;
      }

      // 走这里的情况 uriSegments = /m/users/5b9b27b83255e0002240abef/homepage/v2/product    routeSegments=/m/users/:userId/homepage/v2/product/productId
      if (uriSegment === undefined) {
        // URI is shorter than the route, no match
        // uri:   /users
        // route: /users/:userId
        missed = true;
        break;
      }

      // 动态参数是否匹配 :userId
      // var paramRe = /^:(.+)/;
      let dynamicMatch = paramRe.exec(routeSegment);

      if (dynamicMatch && !isRootUri) {
        // reservedNames = ["uri", "path"];
        let matchIsNotReserved = reservedNames.indexOf(dynamicMatch[1]) === -1;
        invariant(
          matchIsNotReserved,
          `<Router> dynamic segment "${
            dynamicMatch[1]
          }" is a reserved name. Please use a different name in path "${
            route.path
          }".`
        );
        let value = decodeURIComponent(uriSegment);
        params[dynamicMatch[1]] = value;
      } else if (routeSegment !== uriSegment) {
        // Current segments don't match, not dynamic, not splat, so no match
        // uri:   /users/123/settings
        // route: /users/:id/profile
        missed = true;
        break;
      }
    }
    test.innerHTML += "__退出小循环__";

    if (!missed) {
      match = {
        route,
        params,
        uri: "/" + uriSegments.slice(0, index).join("/")
      };
      break;
    }
  }
  test.innerHTML += "__退出大循环__";

  return match || default_ || null;
};

////////////////////////////////////////////////////////////////////////////////
// match(path, uri) - Matches just one path to a uri, also lol
let match = (path, uri) => pick([{ path }], uri);

////////////////////////////////////////////////////////////////////////////////
// resolve(to, basepath)
//
// Resolves URIs as though every path is a directory, no files.  Relative URIs
// in the browser can feel awkward because not only can you be "in a directory"
// you can be "at a file", too. For example
//
//     browserSpecResolve('foo', '/bar/') => /bar/foo
//     browserSpecResolve('foo', '/bar') => /foo
//
// But on the command line of a file system, it's not as complicated, you can't
// `cd` from a file, only directories.  This way, links have to know less about
// their current path. To go deeper you can do this:
//
//     <Link to="deeper"/>
//     // instead of
//     <Link to=`{${props.uri}/deeper}`/>
//
// Just like `cd`, if you want to go deeper from the command line, you do this:
//
//     cd deeper
//     # not
//     cd $(pwd)/deeper
//
// By treating every path as a directory, linking to relative paths should
// require less contextual information and (fingers crossed) be more intuitive.
let resolve = (to, base) => {
  // /foo/bar, /baz/qux => /foo/bar
  if (startsWith(to, "/")) {
    return to;
  }

  let [toPathname, toQuery] = to.split("?");
  let [basePathname] = base.split("?");

  let toSegments = segmentize(toPathname);
  let baseSegments = segmentize(basePathname);

  // ?a=b, /users?b=c => /users?a=b
  if (toSegments[0] === "") {
    return addQuery(basePathname, toQuery);
  }

  // profile, /users/789 => /users/789/profile
  if (!startsWith(toSegments[0], ".")) {
    let pathname = baseSegments.concat(toSegments).join("/");
    return addQuery((basePathname === "/" ? "" : "/") + pathname, toQuery);
  }

  // ./         /users/123  =>  /users/123
  // ../        /users/123  =>  /users
  // ../..      /users/123  =>  /
  // ../../one  /a/b/c/d    =>  /a/b/one
  // .././one   /a/b/c/d    =>  /a/b/c/one
  let allSegments = baseSegments.concat(toSegments);
  let segments = [];
  for (let i = 0, l = allSegments.length; i < l; i++) {
    let segment = allSegments[i];
    if (segment === "..") segments.pop();
    else if (segment !== ".") segments.push(segment);
  }

  return addQuery("/" + segments.join("/"), toQuery);
};

////////////////////////////////////////////////////////////////////////////////
// insertParams(path, params)
let insertParams = (path, params) => {
  let segments = segmentize(path);
  return (
    "/" +
    segments
      .map(segment => {
        let match = paramRe.exec(segment);
        return match ? params[match[1]] : segment;
      })
      .join("/")
  );
};

let validateRedirect = (from, to) => {
  let filter = segment => isDynamic(segment);
  let fromString = segmentize(from)
    .filter(filter)
    .sort()
    .join("/");
  let toString = segmentize(to)
    .filter(filter)
    .sort()
    .join("/");
  return fromString === toString;
};

////////////////////////////////////////////////////////////////////////////////
// Junk
let paramRe = /^:(.+)/;

let SEGMENT_POINTS = 4;
let STATIC_POINTS = 3;
let DYNAMIC_POINTS = 2;
let SPLAT_PENALTY = 1;
let ROOT_POINTS = 1;

let isRootSegment = segment => segment === "";
let isDynamic = segment => paramRe.test(segment);
let isSplat = segment => segment === "*";

let rankRoute = (route, index) => {
  let score = route.default
    ? 0
    : segmentize(route.path).reduce((score, segment) => {
        score += SEGMENT_POINTS;
        if (isRootSegment(segment)) score += ROOT_POINTS;
        else if (isDynamic(segment)) score += DYNAMIC_POINTS;
        else if (isSplat(segment)) score -= SEGMENT_POINTS + SPLAT_PENALTY;
        else score += STATIC_POINTS;
        return score;
      }, 0);
  return { route, score, index };
};

let rankRoutes = routes =>
  routes
    .map(rankRoute)
    .sort(
      (a, b) =>
        a.score < b.score ? 1 : a.score > b.score ? -1 : a.index - b.index
    );

let segmentize = uri =>
  uri
    // strip starting/ending slashes
    .replace(/(^\/+|\/+$)/g, "")
    .split("/");

let addQuery = (pathname, query) => pathname + (query ? `?${query}` : "");

let reservedNames = ["uri", "path"];

////////////////////////////////////////////////////////////////////////////////
export { startsWith, pick, match, resolve, insertParams, validateRedirect };
