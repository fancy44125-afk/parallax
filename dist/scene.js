globalThis.Scene = (() => {
  const geometry = [];
  // Each face keeps its world-space material at every camera heading.
  const materials = new Map();
  function material(css) {
    if (materials.has(css)) return materials.get(css);
    let rgb;
    if (css.startsWith('#')) {
      rgb = [1,3,5].map(i => parseInt(css.slice(i,i+2),16));
    } else {
      const [h,s,l] = css.match(/[\d.]+/g).map(Number);
      const chroma = (1 - Math.abs(2*l/100-1))*s/100;
      const t = chroma*(1-Math.abs(h/60%2-1)), m = l/100-chroma/2;
      // The dome's fixed terracotta palette occupies the first hue sextant.
      rgb = [chroma,t,0].map(v => Math.round((v+m)*255));
    }
    const rgba = (0xff000000 | rgb[2]<<16 | rgb[1]<<8 | rgb[0]) >>> 0;
    materials.set(css,rgba);
    return rgba;
  }
  let seed = 67921;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const turn = 0.42, c = Math.cos(turn), s = Math.sin(turn);
  function world([x,y,z]) { return [x*c+z*s, y, 15+z*c-x*s]; }
  function polygon(vertices, color, local = true) {
    const pts = local ? vertices.map(world) : vertices;
    geometry.push({pts, color:material(color)});
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
    polygon([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],front);
    polygon([[x,y,z+d],[x+w,y,z+d],[x+w,y+h,z+d],[x,y+h,z+d]],side);
    polygon([[x+w,y,z],[x+w,y,z+d],[x+w,y+h,z+d],[x+w,y+h,z]],side);
    polygon([[x,y,z],[x,y,z+d],[x,y+h,z+d],[x,y+h,z]],front);
    polygon([[x,y+h,z],[x+w,y+h,z],[x+w,y+h,z+d],[x,y+h,z+d]],top);
    if(detail) {
      for(let i=0;i<w*h*9;i++){
        const u=x+random()*w, v=y+random()*h, l=0.008+random()*0.038;
        polygon([[u,v,z-.004],[u+l,v,z-.004],[u+l,v+l*.32,z-.004]],i%3?'#a67757':'#d3a17e');
      }
    }
  }
  function facade(x,y,z,w,h,color) {
    polygon([[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]],color);
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
  // Rear service doors and distinct side windows remain fixed to their walls.
  for(let j=0;j<6;j++) {
    const x=-3.67+j*1.12;
    facade(x,.79,2.94,.68,.72,'#614e46');
    facade(x+.05,.84,2.95,.59,.61,'#414948');
    facade(x+.33,.84,2.96,.035,.61,'#bb9372');
  }
  for(const x of [-4.03,3.53]){
    const outward=x<0?-.01:.01;
    for(let j=0;j<3;j++){
      const z=.01+j*.92;
      polygon([[x,.79,z],[x,.79,z+.52],[x,1.67,z+.52],[x,1.67,z]],'#484b44');
      polygon([[x+outward,1.24,z],[x+outward,1.24,z+.52],
        [x+outward,1.28,z+.52],[x+outward,1.28,z]],'#ac8668');
    }
  }
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
      if(j%4===0 && !slit) polygon([domePoint(a,p,1.824),domePoint(a+.011,p,1.824),domePoint(a+.011,q,1.824),domePoint(a,q,1.824)],'#9e7e66');
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
    polygon([[x,yy,z],[x+size*1.4,yy,z],[x+size*.76,size*.63,z]],i%5?'#bf9571':'#785c50',false);
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
  // Three closed ridgelines surround the camera, including behind its start.
  for(let layer=0;layer<3;layer++) {
    const radius=95-18*layer;
    const ridge=angle=>{
      const y=4+(2-layer)*1.8+1.2*Math.sin(angle*9+layer)
        +.9*Math.cos(angle*16+layer*2)+.45*Math.cos(angle*49-layer)+.22*Math.sin(angle*131+layer);
      return [radius*Math.sin(angle),y,15+radius*Math.cos(angle)];
    };
    for(let i=0;i<480;i++) {
      const a=ridge(2*Math.PI*i/480),b=ridge(2*Math.PI*(i+1)/480);
      polygon([a,b,[b[0],0,b[2]],[a[0],0,a[2]]],
        ['#be9d8f','#b08a78','#ac8068'][layer],false);
    }
  }
  polygon([[-4,.012,13],[3.8,.012,14],[7.5,.012,17.8],[1.5,.012,17.2]],'#95725b',false);
  // A small cluster of survey posts gives the tripod something to track behind it.
  function post(x,z,height) {
    const s=.12;
    polygon([[x,0,z],[x+s,0,z],[x+s,height,z],[x,height,z]],'#765748',false);
    polygon([[x+s,0,z],[x+s,0,z+s],[x+s,height,z+s],[x+s,height,z]],'#9a795c',false);
    polygon([[x,height,z],[x+s,height,z],[x+s,height,z+s],[x,height,z+s]],'#dab78e',false);
    polygon([[x,0,z+s],[x+s,0,z+s],[x+s,height,z+s],[x,height,z+s]],'#b58d68',false);
    polygon([[x,0,z],[x,0,z+s],[x,height,z+s],[x,height,z]],'#956f53',false);
  }
  for(let i=0;i<23;i++) {
    const angle=(i+.5)*2*Math.PI/23, radius=12+random()*8;
    post(Math.sin(angle)*radius,Math.cos(angle)*radius,1.05+random()*.38);
  }

  // Weathered outcrops at different distances keep the panorama legible when
  // the camera turns away from the observatory.
  function boulder(x,z,width,height) {
    const faces=['#ad8061','#b48968','#a67c61','#977056','#88664f','#a57c5e'];
    const rim=[], cap=[];
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3, r=width*(.76+.28*random());
      rim.push([x+Math.sin(a)*r,0,z+Math.cos(a)*r*.72]);
      cap.push([x+Math.sin(a)*r*.64,height*(.8+.2*random()),z+Math.cos(a)*r*.54]);
    }
    polygon(cap,'#c59972',false);
    for(let i=0;i<6;i++){const j=(i+1)%6;polygon([rim[i],rim[j],cap[j],cap[i]],faces[i],false);}
  }
  for(let i=0;i<65;i++) {
    const a=.5+random()*5.28,radius=6+random()*37,x=Math.sin(a)*radius,z=Math.cos(a)*radius;
    const width=.18+random()**2*1.35,height=width*(.32+random()*.4);
    boulder(x,z,width,height);
    boulder(x+width*1.3,z-width*.48,width*.38,height*.46);
  }

  function camera(travel=0,mode='slide') {
    const angle = travel===.85 ? 0 : travel/.85*2*Math.PI;
    if(mode==='orbit') return {x:-15*Math.sin(angle),y:1.74,z:15-15*Math.cos(angle),yaw:angle};
    if(mode==='turn'||mode===true) return {x:0,y:1.74,z:0,yaw:angle};
    return {x:travel,y:1.74,z:0,yaw:0};
  }

  // Clip before dividing by Z. This prevents polygons behind the lens from
  // jumping across the frame when a tripod turn passes the side of a wall.
  const near=.15;
  function clipNear(pts) {
    const out=[];
    let a=pts[pts.length-1];
    for(const b of pts) {
      if((a[2]>=near)!==(b[2]>=near)) {
        const t=(near-a[2])/(b[2]-a[2]);
        out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]),near]);
      }
      if(b[2]>=near)out.push(b);
      a=b;
    }
    return out;
  }

  // Reciprocal depth is affine in screen space. Depth-test at pixel centers,
  // retaining the nearest surface regardless of the original mesh order.
  function triangle(a,b,c,color,rgb,depth,w,h) {
    const bx=b[0]-a[0], by=b[1]-a[1], cx=c[0]-a[0], cy=c[1]-a[1];
    const area=bx*cy-by*cx;
    if(Math.abs(area)<.001)return;
    const left=Math.max(0,Math.ceil(Math.min(a[0],b[0],c[0])-.5));
    const right=Math.min(w-1,Math.floor(Math.max(a[0],b[0],c[0])-.5));
    const top=Math.max(0,Math.ceil(Math.min(a[1],b[1],c[1])-.5));
    const bottom=Math.min(h-1,Math.floor(Math.max(a[1],b[1],c[1])-.5));
    if(right<left || bottom<top)return;
    const du=cy/area,dv=-by/area,dyu=-cx/area,dyv=bx/area;
    const db=b[2]-a[2],dc=c[2]-a[2];
    for(let y=top;y<=bottom;y++){
      let u=(left+.5-a[0])*du+(y+.5-a[1])*dyu;
      let v=(left+.5-a[0])*dv+(y+.5-a[1])*dyv;
      let index=y*w+left;
      for(let x=left;x<=right;x++,index++,u+=du,v+=dv) {
        if(u<-.000001 || v<-.000001 || u+v>1.000001)continue;
        const z=a[2]+u*db+v*dc;
        if(z>depth[index]){depth[index]=z;rgb[index]=color;}
      }
    }
  }
  // Reuse one drawing buffer. Frame canvases retain only their color images.
  let buffer;
  function draw(canvas,travel=0,mode='slide'){
    const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,f=1.05*w;
    if(!buffer || buffer.w!==w || buffer.h!==h){
      const image=ctx.createImageData(w,h);
      buffer={w,h,image, rgb:new Uint32Array(image.data.buffer),depth:new Float32Array(w*h)};
    }
    const {image,rgb,depth}=buffer, eye=camera(travel,mode),sy=Math.sin(eye.yaw),cy=Math.cos(eye.yaw);
    function transform([x,y,z]){
      const dx=x-eye.x,dz=z-eye.z;
      return [dx*cy-dz*sy,y-eye.y,dx*sy+dz*cy];
    }
    function project([x,y,z]){return [w*.5+f*x/z,h*.58-f*y/z,1/z];}
    const horizon=.58*h;
    for(let y=0;y<h;y++) {
      const t=Math.min(1,y/horizon);
      const r=Math.round(166+80*t),g=Math.round(153+59*t),b=Math.round(146+25*t);
      rgb.fill(y+.5>=horizon?0xff83add3:(0xff000000|b<<16|g<<8|r),y*w,(y+1)*w);
      // The ground plane also occludes terrain below ground.
      depth.fill(Math.max(0,(y+.5-horizon)/(f*eye.y)),y*w,(y+1)*w);
    }
    const sun=transform([245,137,950]);
    if(sun[2]>near){
      const [sx,sy]=project(sun),radius=.03*w;
      for(let y=Math.max(0,Math.ceil(sy-radius));y<Math.min(h,sy+radius);y++){
        const dx=Math.sqrt(Math.max(0,radius*radius-(y-sy)**2));
        const left=Math.max(0,Math.ceil(sx-dx)),right=Math.min(w,Math.floor(sx+dx)+1);
        if(left<right)rgb.fill(0xffb5e6ff,y*w+left,y*w+right);
      }
    }
    for(const face of geometry) {
      let pts=face.pts.map(transform);
      if(pts.every(p=>p[2]<near))continue;
      if(pts.some(p=>p[2]<near))pts=clipNear(pts);
      const projected=pts.map(project);
      for(let i=1;i+1<projected.length;i++)
        triangle(projected[0],projected[i],projected[i+1],face.color,rgb,depth,w,h);
    }
    ctx.putImageData(image,0,0);
  }
  return {draw,camera};
})();
