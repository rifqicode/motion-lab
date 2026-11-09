export type VisualTheme={background:string;foreground:string;accent:string;fontFamily:string};
export const themes:Record<string,VisualTheme>={
 illustrated:{background:'#f7e8cf',foreground:'#352b2a',accent:'#e47c48',fontFamily:'Arial, sans-serif'},
 techNoir:{background:'#071421',foreground:'#ffffff',accent:'#78eee7',fontFamily:'Arial, sans-serif'}
};
export const defaultTheme=themes.illustrated;
