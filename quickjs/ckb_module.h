#ifndef _CKB_MODULE_H_
#define _CKB_MODULE_H_

#include <stddef.h>
#include <stdio.h>
#include <stdlib.h>

#include "quickjs.h"
int js_init_module_ckb(JSContext *ctx);
int read_local_file(char *buf, int size);

#endif  // _CKB_MODULE_H_
