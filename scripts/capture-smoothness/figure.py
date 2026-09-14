# Synthetic moving person for Chrome's fake camera. No real footage (AGENTS.md).
# 0-8s: standing still (breathing sway). 8-20s: jumping jacks from a real recording + big lateral sweeps.
import json, math, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw
W, H, FPS, SECS = 640, 480, 30, 20
d = json.load(open(sys.argv[1])); frames = d['frames']
out = sys.argv[2]
ff = subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-pix_fmt','yuv420p',out], stdin=subprocess.PIPE)
bg = Image.new('RGB',(W,H),(150,145,135)); bd = ImageDraw.Draw(bg)
bd.rectangle([0,int(H*0.72),W,H], fill=(95,85,75))
for x in range(0,W,80): bd.line([x,0,x,int(H*0.72)], fill=(140,135,125), width=2)
SKIN=(224,172,140); SHIRT=(40,70,140); PANTS=(35,35,40)
def P(lm,i,ox,oy,s): return (ox+lm[i]['x']*s, oy+lm[i]['y']*s)
def limb(dr,a,b,w,c):
    dr.line([a,b], fill=c, width=int(w)); r=w/2
    for p in (a,b): dr.ellipse([p[0]-r,p[1]-r,p[0]+r,p[1]+r], fill=c)
n=len(frames)
for k in range(FPS*SECS):
    t=k/FPS
    if t<8: lm=frames[0]['world']; ox=W/2+3*math.sin(t*1.3); oy=H*0.47
    else:
        lm=frames[int((t-8)*FPS*1.4)%n]['world']
        ox=W/2+150*math.sin((t-8)*2.2); oy=H*0.47+20*math.sin((t-8)*4.4)
    s=200
    img=bg.copy(); dr=ImageDraw.Draw(img)
    g=lambda i:P(lm,i,ox,oy,s)
    for a,b in ((23,25),(25,27),(24,26),(26,28)): limb(dr,g(a),g(b),26,PANTS)
    for a,b in ((27,31),(28,32)): limb(dr,g(a),g(b),14,(20,20,20))
    dr.polygon([g(11),g(12),g(24),g(23)], fill=SHIRT)
    limb(dr,g(11),g(12),24,SHIRT); limb(dr,g(23),g(24),26,PANTS)
    for a,b in ((11,13),(12,14)): limb(dr,g(a),g(b),20,SHIRT)
    for a,b in ((13,15),(14,16)): limb(dr,g(a),g(b),16,SKIN)
    for i in (15,16): x,y=g(i); dr.ellipse([x-11,y-11,x+11,y+11], fill=SKIN)
    sh=((g(11)[0]+g(12)[0])/2,(g(11)[1]+g(12)[1])/2); nx,ny=g(0)
    limb(dr,sh,(nx,ny+18),16,SKIN)
    dr.ellipse([nx-24,ny-32,nx+24,ny+28], fill=SKIN)
    dr.ellipse([nx-26,ny-36,nx+26,ny-8], fill=(50,35,25))
    for i in (2,5): x,y=g(i); dr.ellipse([x-3,y-3,x+3,y+3], fill=(30,30,30))
    x,y=g(9); x2,y2=g(10); dr.line([x,y,x2,y2], fill=(120,50,50), width=3)
    ff.stdin.write(np.asarray(img,dtype=np.uint8).tobytes())
ff.stdin.close(); ff.wait(); print('ok', out)
