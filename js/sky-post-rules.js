// Postal activities share flight coordinates, so steering remains the only aim control.
export const POST = Object.freeze({
  approach: 82, departure: 20, aimRadius: 5.8, tossDuration: .85,
  returnDuration: 1.65, baySpeed: 15, bayApproach: 65,
  chimeReach: 25, chimeRadius: 4.8, choirDraft: 5,
});
export const AIR_ROUTE = Object.freeze({MIDDLE: 'windmills', UPPER: 'sunny', LOWER: 'clouds'});
export const POST_ICONS = Object.freeze({garden: '✿', bakery: '♨', kite: '◇'});

export function makePostCourse() {
  return {
    deliveries: [
      {id: 'garden', s: 265, x: -6, y: -2, color: 0xef92b1, icon: POST_ICONS.garden},
      {id: 'bakery', s: 745, x: 6, y: 2, color: 0xf4c878, icon: POST_ICONS.bakery},
      {id: 'kite', s: 1195, x: -5, y: 4, color: 0x81cbd1, icon: POST_ICONS.kite},
    ],
    routes: [
      {id: AIR_ROUTE.UPPER, x: 6, y: 5.2, radius: 3.3, color: 0xf7d67d, icon: '☀'},
      {id: AIR_ROUTE.MIDDLE, x: 0, y: 0, radius: 3.6, color: 0xc5b4e1, icon: '✣'},
      {id: AIR_ROUTE.LOWER, x: -6, y: -4.4, radius: 3.3, color: 0x9fe0d3, icon: '☁'},
    ],
    airSections: [{start: 350, end: 610}, {start: 835, end: 1065}, {start: 1300, end: 1620}],
    chimes: [
      {id: 'chime-sun', s: 490, x: 6, y: 5.2, color: 0xf7d67d},
      {id: 'chime-mill', s: 955, x: 0, y: 0, color: 0xc5b4e1},
      {id: 'chime-cloud', s: 1435, x: -6, y: -4.4, color: 0x9fe0d3},
    ],
  };
}

export function createPostRun() {
  return {delivered: new Set(), chimes: new Set(), routesSeen: new Set(),
    parcel: null, lastDelivery: null, choir: false, arrival: false, arrivalAt: 0,
    route: AIR_ROUTE.MIDDLE, wind: {x: 0, y: 0, speed: 0}, returns: 0};
}

export function deliveryTarget(run, course) {
  return (course.deliveries ?? []).find(d => !run.post.delivered.has(d.id)
    && run.s >= d.s - POST.approach && run.s <= d.s + POST.departure) ?? null;
}

/** One existing action changes context inside a delivery bay; no extra button. */
export function tossParcel(run, course, events) {
  const target = deliveryTarget(run, course);
  if (!target) return false;
  if (run.post.parcel) return true;

  const caught = Math.hypot(run.x - target.x, run.y - target.y) <= POST.aimRadius;
  run.post.parcel = {id: target.id, age: 0, caught, from: {s: run.s, x: run.x, y: run.y}};
  events.push({type: 'toss', id: target.id, caught});
  return true;
}

export function postalWind(run, course) {
  const post = run.post;
  post.route = AIR_ROUTE.MIDDLE;
  const wind = {x: 0, y: 0, speed: 0};
  const section = (course.airSections ?? []).find(a => run.s >= a.start && run.s <= a.end);
  if (!section) return wind;

  const route = course.routes.find(r => Math.hypot(run.x - r.x, run.y - r.y) < r.radius);
  if (!route) return wind;
  post.route = route.id;
  post.routesSeen.add(route.id);
  if (route.id === AIR_ROUTE.UPPER) {
    wind.speed = 5;
    wind.y = .55;
    // Warm bread makes the second sunny current stronger, visible as steam.
    if (post.delivered.has('bakery') && run.s > 835) { wind.speed += 3; wind.y += .35; }
  }
  if (route.id === AIR_ROUTE.LOWER) {
    wind.speed = post.delivered.has('garden') ? 5 : 1.5;
    wind.y = Math.sin(run.s * .028) * .35;
  }
  if (route.id === AIR_ROUTE.MIDDLE) wind.x = Math.sin(run.elapsed * .7) * .45;
  if (post.delivered.has('kite') && run.s > 1300) wind.speed += 2;
  if (post.choir) wind.speed += POST.choirDraft;
  return wind;
}

export function updatePost(run, course, dt, events) {
  const post = run.post;
  if (post.parcel) {
    post.parcel.age += dt;
    const parcel = post.parcel;
    if (parcel.caught && parcel.age >= POST.tossDuration) {
      post.delivered.add(parcel.id);
      post.lastDelivery = {id: parcel.id, time: run.elapsed};
      post.parcel = null;
      events.push({type: 'delivery', id: parcel.id, deliveries: post.delivered.size});
    } else if (!parcel.caught && parcel.age >= POST.returnDuration) {
      post.parcel = null;
      post.returns++;
      events.push({type: 'parcel-return', id: parcel.id});
    }
  }
  for (const chime of course.chimes ?? []) {
    if (post.chimes.has(chime.id) || run.roll <= 0 || Math.abs(run.s - chime.s) > POST.chimeReach) continue;
    if (Math.hypot(run.x - chime.x, run.y - chime.y) > POST.chimeRadius) continue;
    post.chimes.add(chime.id);
    events.push({type: 'chime', id: chime.id, notes: post.chimes.size});
    if (post.chimes.size === course.chimes.length) {
      post.choir = true;
      events.push({type: 'choir'});
    }
  }
  if (!post.arrival && run.s > course.length - 115) {
    post.arrival = true;
    post.arrivalAt = run.elapsed;
    events.push({type: 'arrival', deliveries: post.delivered.size});
  }
}

export function postSnapshot(run, course) {
  const target = deliveryTarget(run, course);
  const chime = (course.chimes ?? []).find(c => !run.post.chimes.has(c.id) && Math.abs(c.s - run.s) < 60);
  return {deliveries: run.post.delivered.size, delivered: [...run.post.delivered],
    totalDeliveries: course.deliveries?.length ?? 0, parcels: (course.deliveries?.length ?? 0) - run.post.delivered.size,
    deliveryTarget: target ? {id: target.id, icon: target.icon, ready: Math.hypot(run.x - target.x, run.y - target.y) <= POST.aimRadius,
      x: target.x, y: target.y, distance: target.s - run.s} : null,
    parcelInFlight: Boolean(run.post.parcel), parcelReturns: run.post.returns,
    chimes: run.post.chimes.size, chimeNear: Boolean(chime), choir: run.post.choir,
    route: run.post.route, routesSeen: [...run.post.routesSeen], arrival: run.post.arrival};
}
