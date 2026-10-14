import sys
import os
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B=os.path.join(ROOT,'src')+'/'
src=open(B+'engine-v1.html').read().split('\n')
kept='\n'.join(src[347:1774])
a='S.progress = ++done / leagues.length; if(!quiet) renderStatus();'
assert kept.count(a)==1
kept=kept.replace(a,'S.progress = ++done / leagues.length; (S.scanLog ||= []).unshift(lg.name); if(!quiet) renderStatus();')
kept=kept.replace('${Math.round(m.win*100)}% win</div>','</div>',1)
kept=kept.replace('<span class="num">${Math.round(a.conf*100)}% sure</span>','<span class="num" title="How often the projected leader outscores the other when each projection can miss by about 45%">${Math.round(a.conf*100)}% model confidence</span>',1)
ui=open(B+'ui.js').read(); ui2=open(B+'ui2.js').read()+'\n'+open(B+'ui3.js').read()+'\n'+open(B+'ui4.js').read()+'\n'+open(B+'ui5.js').read()+'\n'+open(B+'ui6.js').read()
assert ui.count('\nSPACE.init();')==1
ui=ui.replace('\nSPACE.init();', '\n'+ui2+'\nSPACE.init();')
out=open(B+'head.html').read()+kept+'\n'+ui+'\n</script>\n</body>\n</html>\n'
open(os.path.join(ROOT,'index.html'),'w').write(out)
print('ok', len(out))
