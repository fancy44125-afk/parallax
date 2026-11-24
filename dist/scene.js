// A tiny painter's-algorithm renderer. Every textured mark has a fixed world
// position, so the tracker sees actual projected geometry in successive frames.
globalThis.Scene = (() => {
  const geometry = [];
  let seed = 67921;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const turn = 0.42, c = Math.cos(turn), s = Math.sin(turn);
  function world([x,y,z]) { return [x*c+z*s, y, 15+z*c-x*s]; }
  function polygon(vertices, color, local = true, bias = 0) {
    const pts = local ? vertices.map(world) : vertices;
    geometry.push({pts, color, depth: pts.reduce((sum,p) => sum+p[2],0)/pts.length + bias});
  }
  const palette = {
    clay: ['#ba7957','#754939','#e0a578'],
    chalk: ['#d7a47c','#946851','#edd1a1'],
    dusk: ['#945d4c','#664444','#c38667'],
    black: ['#453e3c','#302f31','#766552'],
    stone: ['#bc9475','#826554','#e4c397']
  };
  function box(x,y,z,w,h,d,colors,detail=false) {
    const [front,side,top] = colors;
    // Split long facades into strips so windows share their local depth order.
    const strips = Math.ceil(w / .2);
    for(let i=0; i<strips; i++) {
      const u=x+w*i/strips, v=x+w*(i+1)/strips+.001;
      polygon([[u,y,z],[v,y,z],[v,y+h,z],[u,y+h,z]],front);
    }
    polygon([[x+w,y,z],[x+w,y,z+d],[x+w,y+h,z+d],[x+w,y+h,z]],side);
    polygon([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]],top);
    if(detail) {
      for(let i=0;i<w*h*9;i++){
        const u=x+random()*w, v=y+random()*h, l=0.008+random()*0.038;
        polygon([[u,v,z-.004],[u+l,v,z-.004],[u+l,v+l*.32,z-.004]],i%3?'#57382c35':'#fff3c94f',true,-.055);
      }
    }
  }
  // Large polygons are sorted by surface groups: details on a wall must stay
  // above their parent even when its far edge sits behind another wall.
  function facade(x,y,z,w,h,color) {
    polygon([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],color,true,-.08);
  }
  // Rear utility tower and its roof fixtures.
  box(2.15,0,1.3,1.32,4.42,1.4,palette.dusk,true);
  box(2.08,4.42,1.22,1.47,.14,1.53,palette.chalk);
  box(2.49,4.55,1.7,.12,1.13,.12,palette.black);
  box(2.3,5.38,1.73,.52,.035,.05,palette.black);
  for(let i=0;i<5;i++) facade(2.43,3.62+i*.10,1.28,.73,.055,'#483e3a');
  // Long stepped plinth, deep openings and an upper instrument deck.
  box(-4.45,0,-.42,8.22,.34,3.62,palette.stone,true);
  box(-4.02,.34,-.32,7.54,1.72,3.25,palette.clay,true);
  box(-4.12,2.06,-.43,7.75,.18,3.42,palette.chalk);
  for(let i=0;i<11;i++){
    const x=-3.77+i*.63;
    facade(x,.64,-.36,.36,.97,'#705449');
    facade(x+.035,.68,-.38,.29,.87,i%3?'#3d4544':'#4a4c46');
    facade(x+.16,.68,-.40,.024,.87,'#947359');
    facade(x+.035,1.26,-.40,.29,.025,'#b88e69');
  }
  box(-2.86,2.24,.0,4.48,.74,2.64,palette.dusk,true);
  box(-2.96,2.97,-.08,4.68,.16,2.80,palette.chalk);
  for(let i=0;i<9;i++) facade(-2.62+.47*i,2.45,-.04,.27,.12,'#403e3b');
  // Ribbed metal telescope dome on a cylindrical drum.
  const cx=-.66,cz=1.29,r=1.82,base=3.13;
  const domePoint=(angle,lat,radius=r)=>[cx+radius*Math.cos(lat)*Math.cos(angle),base+.31+radius*Math.sin(lat),cz+radius*Math.cos(lat)*Math.sin(angle)];
  const rings=8, slices=52;
  for(let j=0;j<slices;j++) {
    const a=2*Math.PI*j/slices,b=2*Math.PI*(j+1)/slices;
    const cylinder=(angle,y)=>[cx+r*Math.cos(angle),y,cz+r*Math.sin(angle)];
    const light=Math.cos(a+2.34);
    polygon([cylinder(a,base),cylinder(b,base),cylinder(b,base+.31),cylinder(a,base+.31)],'hsl(20 24% '+(48+light*15)+'%)');
    for(let i=0;i<rings;i++){
      const p=Math.PI*.5*i/rings,q=Math.PI*.5*(i+1)/rings;
      const luminance=51+light*Math.cos(p)*17+Math.sin(p)*17;
      const slit=j===37||j===38;
      polygon([domePoint(a,p),domePoint(b,p),domePoint(b,q),domePoint(a,q)],
        slit?'#4c4641':'hsl(27 33% '+(luminance+(j%4===0?-2:0))+'%)');
      if(j%4===0 && !slit) polygon([domePoint(a,p,1.824),domePoint(a+.011,p,1.824),domePoint(a+.011,q,1.824),domePoint(a,q,1.824)],'#9e7e66',true,-.013);
    }
  }
  // Foreground staircase with illuminated treads.
  for(let i=0;i<6;i++) box(-1.96,0,-1.69+i*.21,1.85,.055*(i+1),.225,palette.stone);
  // A retaining wall, paving and wind-sculpted stones provide near-field tracks.
  box(3.71,0,-1.46,.62,.86,3.58,palette.clay,true);
  for(let i=0;i<175;i++) {
    const x=random()*28-14,z=random()*19+5;
    if(z>12 && z<19 && Math.abs(x)<4.6)continue;
    const size=.016+random()**3*.22, yy=.01;
    polygon([[x,yy,z],[x+size*2,yy,z],[x+size*1.42,yy,z+.22]],'#a27558',false);
    polygon([[x,yy,z],[x+size*1.4,yy,z],[x+size*.76,size*.63,z]],i%5?'#bf9571':'#785c50',false,-.01);
  }
  // A few agaves sit closer to the lens than the building. Their points
  // travel farther between views and make the inverse-depth effect visible.
  for(const [x,z,scale] of [[-2.7,8.8,.7],[2.95,9.4,.94],[-4.9,12,.86],[4.9,14.6,.6]]) {
    for(let leaf=0; leaf<18; leaf++) {
      const angle=random()*Math.PI*2, reach=(.19+random()*.24)*scale;
      const dx=Math.cos(angle)*reach, dz=Math.sin(angle)*reach;
      polygon([[x-.038,0,z],[x+dx,.22*scale+random()*.54*scale,z+dz],[x+.038,0,z]],
        ['#74785a','#62664c','#929171','#515c48'][leaf%4],false);
    }
  }
  geometry.sort((a,b)=>b.depth-a.depth);
  function draw(canvas, baseline=0, rotationOnly=false) {
    const ctx=canvas.getContext('2d'), w=canvas.width,h=canvas.height,f=w*1.05;
    const cam=rotationOnly?0:baseline, yaw=rotationOnly?baseline*.075:0;
    const cy=Math.cos(yaw),sy=Math.sin(yaw);
    function project([x,y,z]){
      const dx=x-cam, depth=dx*sy+z*cy;
      return [w*.5+f*(dx*cy-z*sy)/depth,h*.58-f*(y-1.74)/depth];
    }
    function paint(vertices,color){
      ctx.beginPath();
      for(let i=0;i<vertices.length;i++){
        const p=project(vertices[i]);
        if(i)ctx.lineTo(...p);else ctx.moveTo(...p);
      }
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
    }
    const sky=ctx.createLinearGradient(0,0,0,h*.74);
    sky.addColorStop(0,'#9b8e8a');sky.addColorStop(.5,'#e9bc99');sky.addColorStop(1,'#f7d9aa');
    ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
    const sun=project([24,17,95]);ctx.fillStyle='#ffe6b5';ctx.beginPath();ctx.arc(...sun,w*.03,0,Math.PI*2);ctx.fill();
    for(let layer=0;layer<3;layer++){
      const z=78-layer*17, pts=[[-100,-25,z]];
      for(let x=-100;x<=100;x+=.6){
        const y=2+(2-layer)*1.4+Math.cos(x*.23+layer)*1.5+Math.sin(x*.59-layer*7)*.8+Math.sin(x*2.39+layer)*.29;
        pts.push([x,y,z]);
      }
      pts.push([100,-25,z]);paint(pts,['#be9d8f','#b08a78','#ac8068'][layer]);
    }
    paint([[-100,0,43],[100,0,43],[100,0,2],[-100,0,2]],'#d3ad83');
    paint([[-4,0,13],[3.8,0,14],[7.5,0,17.8],[1.5,0,17.2]],'#95725b');
    for(const face of geometry) paint(face.pts,face.color);
  }
  return {draw};
})();
