// Three parcels to three islands. Steering is the only aim: fly at the
// island's catcher and throw.
export const POST = Object.freeze({
  approach: 82, departure: 20, aimRadius: 5.8, tossDuration: .85,
  returnDuration: 1.65, baySpeed: 15, bayApproach: 65,
});
export const POST_ICONS = Object.freeze({garden: '✿', bakery: '♨', kite: '◇'});

export function makePostCourse() {
  return {
    deliveries: [
      {id: 'garden', s: 265, x: -6, y: -2, color: 0xef92b1, icon: POST_ICONS.garden},
      {id: 'bakery', s: 745, x: 6, y: 2, color: 0xf4c878, icon: POST_ICONS.bakery},
      {id: 'kite', s: 1195, x: -5, y: 4, color: 0x81cbd1, icon: POST_ICONS.kite},
    ],
  };
}

export function createPostRun() {
  return {delivered: new Set(), parcel: null, lastDelivery: null, arrival: false, arrivalAt: 0, returns: 0};
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
  if (!post.arrival && run.s > course.length - 115) {
    post.arrival = true;
    post.arrivalAt = run.elapsed;
    events.push({type: 'arrival', deliveries: post.delivered.size});
  }
}

export function postSnapshot(run, course) {
  const target = deliveryTarget(run, course);
  return {deliveries: run.post.delivered.size, delivered: [...run.post.delivered],
    totalDeliveries: course.deliveries?.length ?? 0, parcels: (course.deliveries?.length ?? 0) - run.post.delivered.size,
    deliveryTarget: target ? {id: target.id, icon: target.icon, ready: Math.hypot(run.x - target.x, run.y - target.y) <= POST.aimRadius,
      x: target.x, y: target.y, distance: target.s - run.s} : null,
    parcelInFlight: Boolean(run.post.parcel), parcelReturns: run.post.returns, arrival: run.post.arrival};
}
