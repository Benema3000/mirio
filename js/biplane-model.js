// The Skydaisy: an original little toy biplane. Nothing here reads or changes
// Miro's artwork. +Z is forward, +Y up; the main wheels rest on local Y=0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const BIPLANE_DIMENSIONS = Object.freeze({ span: 3.8, length: 3.25, height: 1.70, wheelRadius: .22, footprintRadius: 2.1 });
// Passenger-model origin, not the cushion height: Mirio's hip joint is .58
// above his feet origin, so .40 places folded legs at the .98-high seat top.
export const BIPLANE_SEAT = Object.freeze([0, .40, -.25]);
const Y = new THREE.Vector3(0, 1, 0);
const COLOR = { teal: 0x25a99f, tealDark: 0x167b80, cream: 0xffedc2, gold: 0xefb857, brass: 0xc88c43,
  dark: 0x263c46, leather: 0x936342, wood: 0xb77c47, woodLight: 0xe0b77c, steel: 0xc7d9d2, rubber: 0x27333d };

function paint(geometry, color) {
  const c = new THREE.Color(color);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}
function merge(parts) {
  const geometries = parts.map(geometry => {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    for (const key of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
    return g;
  });
  const result = mergeGeometries(geometries);
  for (const g of new Set([...parts, ...geometries])) g.dispose();
  return result;
}
function ellipsoid(scale, position, color, segments = 20) {
  return paint(new THREE.SphereGeometry(1, segments, Math.round(segments * .65)).scale(...scale).translate(...position), color);
}
function rod(from, to, radius, color, segments = 7) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
  const delta = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), segments)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(Y, delta.normalize())).translate(...a.add(b).multiplyScalar(.5).toArray());
  return paint(geometry, color);
}
function tube(points, radius, color, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  return paint(new THREE.TubeGeometry(curve, segments, radius, 6, false), color);
}
function disc(radius, depth, position, axis, color, segments = 20) {
  const g = new THREE.CylinderGeometry(radius, radius, depth, segments);
  if (axis === 'x') g.rotateZ(Math.PI / 2);
  if (axis === 'z') g.rotateX(Math.PI / 2);
  return paint(g.translate(...position), color);
}

// A round cowling and tapering tail; enough axial rings for a real cockpit cutout.
const BODY_PROFILE = [[-1.42, .065], [-1.25, .15], [-.95, .23], [-.55, .31], [-.05, .39], [.46, .43], [.88, .37], [1.20, .305], [1.35, .25]];
function bodyRadius(z) {
  for (let i = 1; i < BODY_PROFILE.length; i++) {
    const [end, r1] = BODY_PROFILE[i];
    if (z > end) continue;
    const [start, r0] = BODY_PROFILE[i - 1];
    const t = THREE.MathUtils.clamp((z - start) / (end - start), 0, 1);
    return r0 + (r1 - r0) * (t * t * (3 - 2 * t));
  }
  return BODY_PROFILE.at(-1)[1];
}
function fuselage() {
  const profile = Array.from({length: 37}, (_, i) => {
    const z = -1.42 + i / 36 * 2.77;
    return new THREE.Vector2(bodyRadius(z), z);
  });
  const g = new THREE.LatheGeometry(profile, 48).rotateX(Math.PI / 2).translate(0, .83, 0);
  const positions = g.attributes.position;
  const indices = [];
  for (let i = 0; i < g.index.count; i += 3) {
    const a = g.index.getX(i), b = g.index.getX(i + 1), c = g.index.getX(i + 2);
    const x = (positions.getX(a) + positions.getX(b) + positions.getX(c)) / 3;
    const y = (positions.getY(a) + positions.getY(b) + positions.getY(c)) / 3;
    const z = (positions.getZ(a) + positions.getZ(b) + positions.getZ(c)) / 3;
    // Remove only the upper oval. The interior is a separate recessed bowl.
    if (y > .86 && (x / .29) ** 2 + ((z + .25) / .49) ** 2 < 1) continue;
    indices.push(a, b, c);
  }
  g.setIndex(indices);
  return paint(g, COLOR.teal);
}
function wing(span, chord, height, z, color) {
  const x = span / 2, c = chord / 2, r = Math.min(.22, c * .75);
  const shape = new THREE.Shape();
  shape.moveTo(-x + r, -c);
  shape.lineTo(x - r, -c);
  shape.quadraticCurveTo(x, -c, x, -c + r);
  shape.lineTo(x, c - r);
  shape.quadraticCurveTo(x, c, x - r, c);
  shape.lineTo(-x + r, c);
  shape.quadraticCurveTo(-x, c, -x, c - r);
  shape.lineTo(-x, -c + r);
  shape.quadraticCurveTo(-x, -c, -x + r, -c);
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: .08, bevelEnabled: true, bevelSize: .025,
    bevelThickness: .025, bevelSegments: 2, curveSegments: 6}).rotateX(Math.PI / 2).translate(0, height + .04, z);
  return paint(geometry, color);
}
function propellerGeometry() {
  const parts = [];
  const blade = new THREE.Shape();
  blade.moveTo(-.055, .08);
  blade.bezierCurveTo(-.09, .24, -.11, .44, -.035, .62);
  blade.quadraticCurveTo(.045, .7, .105, .6);
  blade.bezierCurveTo(.17, .41, .11, .24, .04, .08);
  blade.closePath();
  for (const angle of [0, Math.PI]) {
    const g = new THREE.ExtrudeGeometry(blade, {depth: .035, bevelEnabled: true, bevelSize: .012,
      bevelThickness: .012, bevelSegments: 2, curveSegments: 7}).translate(0, 0, -.02).rotateZ(angle);
    parts.push(paint(g, COLOR.wood));
    parts.push(ellipsoid([.045, .16, .006], [.02, .41, .034], COLOR.woodLight, 10).rotateZ(angle));
    parts.push(ellipsoid([.052, .06, .008], [.025, .588, .036], COLOR.cream, 10).rotateZ(angle));
  }
  parts.push(disc(.105, .15, [0, 0, 0], 'z', COLOR.brass));
  parts.push(ellipsoid([.14, .14, .14], [0, 0, .085], COLOR.cream, 16));
  return merge(parts);
}
function wheelGeometry() {
  const parts = [];
  // Torus tyres have round shoulders; a dark inset closes the hollow middle.
  parts.push(paint(new THREE.TorusGeometry(.155, .065, 10, 24).rotateY(Math.PI / 2), COLOR.rubber));
  parts.push(disc(.145, .105, [0, 0, 0], 'x', COLOR.dark));
  for (const side of [-1, 1]) {
    parts.push(disc(.112, .014, [side * .071, 0, 0], 'x', COLOR.cream));
    parts.push(disc(.057, .027, [side * .079, 0, 0], 'x', COLOR.teal));
    parts.push(ellipsoid([.019, .021, .021], [side * .097, 0, 0], COLOR.brass, 8));
  }
  return merge(parts);
}

/** Five static batches, one propeller, two independently rolling main wheels. */
export function buildBiplane(_art = null) {
  const group = new THREE.Group();
  group.name = 'biplane:skydaisy';
  const shell = [fuselage(), wing(3.75, .82, 1.62, .55, COLOR.cream), wing(3.45, .76, .58, .43, COLOR.cream),
    wing(1.16, .49, .87, -1.11, COLOR.teal)];
  const trim = [], dark = [], markers = [];

  // A warm cream engine cowling, brass collar and small charcoal vents.
  shell.push(ellipsoid([.326, .326, .19], [0, .83, 1.25], COLOR.cream));
  trim.push(disc(.292, .045, [0, .83, 1.385], 'z', COLOR.brass, 32));
  dark.push(disc(.257, .014, [0, .83, 1.414], 'z', COLOR.dark, 32));
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    trim.push(disc(.023, .02, [Math.cos(a) * .205, .83 + Math.sin(a) * .205, 1.429], 'z', COLOR.steel, 8));
  }
  shell.push(ellipsoid([.067, .067, .095], [0, .83, -1.43], COLOR.tealDark, 12));

  // Wingtip bands and a row of quiet fabric ribs, all merged into the shell.
  for (const [span, chord, y, z] of [[3.75, .82, 1.62, .55], [3.45, .76, .58, .43]]) {
    for (const side of [-1, 1]) {
      shell.push(paint(new THREE.BoxGeometry(.20, .009, chord - .12).translate(side * (span / 2 - .37), y + .07, z), COLOR.teal));
      shell.push(paint(new THREE.BoxGeometry(.04, .01, chord - .12).translate(side * (span / 2 - .53), y + .071, z), COLOR.gold));
      for (const rib of [.52, .83, 1.12]) {
        shell.push(rod([side * rib, y + .068, z - chord * .34], [side * rib, y + .068, z + chord * .34], .005, 0xe1d5b4, 4));
      }
    }
  }
  // N struts and fine rigging. No collision boxes or sharp silhouette spikes.
  for (const side of [-1, 1]) {
    const x = side * 1.22;
    for (const z of [.17, .83]) trim.push(rod([x, .65, z], [x, 1.55, z], .029, COLOR.brass));
    trim.push(rod([x, .66, .18], [x, 1.55, .82], .027, COLOR.cream));
    dark.push(rod([x, .65, .82], [x, 1.55, .18], .009, 0x6f7a72, 5));
    trim.push(rod([side * .28, 1.07, .51], [side * .52, 1.55, .48], .025, COLOR.brass));
    markers.push(ellipsoid([.068, .028, .09], [side * 1.78, 1.655, .55], side < 0 ? 0xffb56d : 0x8bf4e4, 10));
  }

  // Leather cockpit beading follows the real curved opening, not a flat decal.
  const rim = [];
  for (let i = 0; i <= 48; i++) {
    const a = i / 48 * Math.PI * 2, x = Math.sin(a) * .29, z = -.25 + Math.cos(a) * .49;
    const r = bodyRadius(z);
    rim.push([x, .83 + Math.sqrt(Math.max(.015, r * r - x * x)) + .012, z]);
  }
  trim.push(tube(rim, .029, COLOR.leather, 64));
  dark.push(paint(new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    .scale(.292, .29, .49).translate(0, 1.075, -.25), 0x31404a));
  shell.push(ellipsoid([.205, .075, .20], [0, .91, -.30], COLOR.leather, 16));
  shell.push(ellipsoid([.22, .24, .055], [0, 1.045, -.63], COLOR.leather, 16));
  dark.push(rod([0, .96, .02], [0, 1.18, .10], .018, COLOR.dark));
  trim.push(paint(new THREE.TorusGeometry(.10, .012, 5, 16).rotateX(-.35).translate(0, 1.2, .105), COLOR.brass));

  const windshieldGeometry = new THREE.SphereGeometry(.35, 20, 12, 0, Math.PI, 0, Math.PI / 2)
    .scale(.92, .8, .7).translate(0, 1.15, .17);
  const windshield = new THREE.Mesh(windshieldGeometry, new THREE.MeshPhongMaterial({
    color: 0xc6f1f3, specular: 0xffffff, shininess: 90, transparent: true, opacity: .34,
    side: THREE.DoubleSide, depthWrite: false,
  }));
  windshield.name = 'biplane:windscreen';
  const arch = [];
  for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI; arch.push([Math.cos(a) * .322, 1.15 + Math.sin(a) * .28, .17]); }
  trim.push(tube(arch, .013, COLOR.brass));

  const fin = new THREE.Shape();
  fin.moveTo(-.31, 0); fin.bezierCurveTo(-.2, .15, -.17, .61, .06, .68);
  fin.bezierCurveTo(.25, .76, .34, .45, .34, 0); fin.closePath();
  shell.push(paint(new THREE.ExtrudeGeometry(fin, {depth: .055, bevelEnabled: true, bevelSize: .022,
    bevelThickness: .017, bevelSegments: 2, curveSegments: 10}).translate(0, 0, -.0275).rotateY(Math.PI / 2).translate(0, .9, -1.12), COLOR.teal));
  for (const side of [-1, 1]) {
    shell.push(paint(new THREE.CircleGeometry(.11, 24).rotateY(side * Math.PI / 2).translate(side * .052, 1.26, -1.20), COLOR.cream));
    markers.push(paint(new THREE.CircleGeometry(.047, 16).rotateY(side * Math.PI / 2).translate(side * .054, 1.26, -1.20), COLOR.gold));
  }

  // A sprung undercarriage and small rear roller make the parked toy feel grounded.
  trim.push(rod([-.66, .22, .53], [.66, .22, .53], .041, COLOR.steel));
  for (const side of [-1, 1]) {
    trim.push(rod([side * .28, .58, .25], [side * .64, .23, .53], .038, COLOR.brass));
    trim.push(rod([side * .25, .55, .84], [side * .64, .23, .53], .035, COLOR.brass));
  }
  trim.push(rod([0, .70, -1.20], [0, .135, -1.17], .028, COLOR.brass));
  dark.push(disc(.125, .11, [0, .13, -1.17], 'x', COLOR.rubber, 16));
  trim.push(disc(.045, .115, [0, .13, -1.17], 'x', COLOR.cream, 10));

  const surface = new THREE.MeshPhongMaterial({color: 0xffffff, vertexColors: true, shininess: 40, specular: 0x576360});
  const metal = new THREE.MeshPhongMaterial({color: 0xffffff, vertexColors: true, shininess: 70, specular: 0xbac5b5});
  const matte = new THREE.MeshPhongMaterial({color: 0xffffff, vertexColors: true, shininess: 12, specular: 0x25313a, side: THREE.DoubleSide});
  const light = new THREE.MeshBasicMaterial({color: 0xffffff, vertexColors: true, toneMapped: false});
  for (const [name, parts, material] of [['shell', shell, surface], ['trim', trim, metal], ['interior', dark, matte], ['markers', markers, light]]) {
    const mesh = new THREE.Mesh(merge(parts), material);
    mesh.name = `biplane:${name}`;
    group.add(mesh);
  }
  group.add(windshield);
  const propeller = new THREE.Mesh(propellerGeometry(), surface);
  propeller.name = 'biplane:wooden-propeller';
  propeller.position.set(0, .83, 1.49);
  group.add(propeller);
  const wheel = wheelGeometry();
  const wheels = [-1, 1].map(side => {
    const mesh = new THREE.Mesh(wheel, matte);
    mesh.name = `biplane:wheel:${side < 0 ? 'left' : 'right'}`;
    mesh.position.set(side * .64, .22, .53);
    group.add(mesh);
    return mesh;
  });
  return {
    group, propeller, wheels, windshield,
    seat: {position: new THREE.Vector3(...BIPLANE_SEAT), facing: new THREE.Vector3(0, 0, 1)},
    dimensions: BIPLANE_DIMENSIONS,
    footprint: {radius: BIPLANE_DIMENSIONS.footprintRadius, halfWidth: 1.9, front: 1.72, back: -1.53},
  };
}
